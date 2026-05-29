//! # Memory Arena Allocator
//!
//! A single ~40MB bump allocator for zero-allocation frame processing.
//! All frame buffers and AI computation temporaries are allocated from this arena.
//! No dynamic heap allocation occurs during real-time frame processing.
//!
//! ## Design
//! - Pre-allocates a contiguous 40MB block at engine startup
//! - Uses a bump pointer for O(1) allocation
//! - Supports per-frame reset (rewind the bump pointer to zero)
//! - Thread-safe via atomic operations on the bump offset
//! - Alignment-aware: all allocations are 16-byte aligned for SIMD compatibility

use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Default arena size: 40MB (sufficient for 1080p RGBA frames + inference temporaries)
pub const DEFAULT_ARENA_SIZE: usize = 40 * 1024 * 1024;

/// Required alignment for all arena allocations (16 bytes for SIMD/NEON compatibility)
const ALIGNMENT: usize = 16;

/// Errors that can occur during arena operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArenaError {
    /// The arena does not have enough remaining capacity for the requested allocation
    OutOfMemory { requested: usize, available: usize },
    /// The arena has already been initialized
    AlreadyInitialized,
    /// The arena size is invalid (zero or too small)
    InvalidSize(usize),
}

impl std::fmt::Display for ArenaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ArenaError::OutOfMemory {
                requested,
                available,
            } => write!(
                f,
                "Arena OOM: requested {} bytes but only {} available",
                requested, available
            ),
            ArenaError::AlreadyInitialized => write!(f, "Arena already initialized"),
            ArenaError::InvalidSize(s) => write!(f, "Invalid arena size: {} bytes", s),
        }
    }
}

impl std::error::Error for ArenaError {}

/// A fixed-size, bump-allocator memory arena for real-time frame processing.
///
/// The arena pre-allocates a contiguous block of memory at startup and provides
/// O(1) allocation by simply advancing a bump pointer. At the end of each frame,
/// the pointer is rewound to zero, effectively "freeing" all frame-local allocations
/// without any deallocation overhead.
///
/// # Safety
/// The arena uses `UnsafeCell` internally for interior mutability of the backing
/// buffer while maintaining thread-safe bump pointer advancement via atomics.
pub struct MemoryArena {
    /// The backing memory buffer
    buffer: UnsafeCell<Vec<u8>>,
    /// Current bump offset (atomic for thread safety)
    offset: AtomicUsize,
    /// Total arena capacity in bytes
    capacity: usize,
    /// High-water mark: tracks peak usage for diagnostics
    high_water_mark: AtomicUsize,
    /// Number of allocations since last reset
    allocation_count: AtomicUsize,
}

// SAFETY: The arena uses atomic operations for all mutable state (offset, high_water_mark,
// allocation_count). The backing buffer is only written to via properly aligned, non-overlapping
// slices obtained through the bump allocator, which guarantees no data races.
unsafe impl Send for MemoryArena {}
unsafe impl Sync for MemoryArena {}

impl MemoryArena {
    /// Creates a new memory arena with the specified capacity.
    ///
    /// # Arguments
    /// * `size` - Total arena size in bytes. Must be at least 1024 bytes.
    ///
    /// # Returns
    /// `Ok(MemoryArena)` on success, `Err(ArenaError)` if the size is invalid.
    ///
    /// # Example
    /// ```
    /// use nhai_edge_engine::memory_arena::{MemoryArena, DEFAULT_ARENA_SIZE};
    /// let arena = MemoryArena::new(DEFAULT_ARENA_SIZE).unwrap();
    /// assert_eq!(arena.capacity(), DEFAULT_ARENA_SIZE);
    /// ```
    pub fn new(size: usize) -> Result<Self, ArenaError> {
        if size < 1024 {
            return Err(ArenaError::InvalidSize(size));
        }

        // Pre-allocate the entire buffer and zero-initialize for deterministic behavior
        let buffer = vec![0u8; size];

        Ok(Self {
            buffer: UnsafeCell::new(buffer),
            offset: AtomicUsize::new(0),
            capacity: size,
            high_water_mark: AtomicUsize::new(0),
            allocation_count: AtomicUsize::new(0),
        })
    }

    /// Creates a new arena with the default 40MB size.
    pub fn with_default_size() -> Result<Self, ArenaError> {
        Self::new(DEFAULT_ARENA_SIZE)
    }

    /// Allocates `size` bytes from the arena, returning a mutable slice.
    ///
    /// All allocations are 16-byte aligned for SIMD compatibility.
    /// This operation is O(1) and lock-free (uses atomic CAS loop).
    ///
    /// # Arguments
    /// * `size` - Number of bytes to allocate
    ///
    /// # Returns
    /// A mutable byte slice of the requested size, or an error if OOM.
    ///
    /// # Safety Guarantee
    /// The returned slice is guaranteed to:
    /// - Be 16-byte aligned
    /// - Not overlap with any other active allocation
    /// - Remain valid until the next call to `reset()`
    #[allow(clippy::mut_from_ref)]
    pub fn alloc(&self, size: usize) -> Result<&mut [u8], ArenaError> {
        if size == 0 {
            return Ok(&mut []);
        }

        loop {
            let current = self.offset.load(Ordering::Relaxed);

            // Align the current offset up to ALIGNMENT boundary
            let aligned = (current + ALIGNMENT - 1) & !(ALIGNMENT - 1);
            let new_offset = aligned + size;

            if new_offset > self.capacity {
                return Err(ArenaError::OutOfMemory {
                    requested: size,
                    available: self.capacity.saturating_sub(aligned),
                });
            }

            // Atomic CAS to advance the bump pointer
            if self
                .offset
                .compare_exchange_weak(current, new_offset, Ordering::AcqRel, Ordering::Relaxed)
                .is_ok()
            {
                // Update high-water mark if needed
                let mut hwm = self.high_water_mark.load(Ordering::Relaxed);
                while new_offset > hwm {
                    match self.high_water_mark.compare_exchange_weak(
                        hwm,
                        new_offset,
                        Ordering::Relaxed,
                        Ordering::Relaxed,
                    ) {
                        Ok(_) => break,
                        Err(actual) => hwm = actual,
                    }
                }

                self.allocation_count.fetch_add(1, Ordering::Relaxed);

                // SAFETY: We have exclusive access to buffer[aligned..new_offset] because:
                // 1. The CAS succeeded, guaranteeing no other thread got this range
                // 2. The buffer is pre-allocated and will not be reallocated
                // 3. The returned slice does not overlap with any other allocation
                let slice = unsafe {
                    let buf = &mut *self.buffer.get();
                    &mut buf[aligned..new_offset]
                };
                return Ok(slice);
            }
            // CAS failed, retry with updated offset
        }
    }

    /// Allocates a typed slice of `count` elements from the arena.
    ///
    /// The allocation is properly aligned for type `T` (minimum 16 bytes).
    /// Elements are zero-initialized.
    ///
    /// # Arguments
    /// * `count` - Number of elements of type T to allocate
    ///
    /// # Returns
    /// A mutable slice of `count` zero-initialized elements of type T.
    #[allow(clippy::mut_from_ref)]
    pub fn alloc_slice<T: Copy + Default>(&self, count: usize) -> Result<&mut [T], ArenaError> {
        let byte_size = count * std::mem::size_of::<T>();
        let bytes = self.alloc(byte_size)?;

        // SAFETY: The allocation is at least 16-byte aligned, which satisfies
        // the alignment requirement for all primitive types and most SIMD types.
        // We also zero-initialized the buffer, so the default values are valid.
        let ptr = bytes.as_mut_ptr() as *mut T;

        // Verify alignment for the target type
        assert!(
            (ptr as usize).is_multiple_of(std::mem::align_of::<T>()),
            "Arena allocation misaligned for type"
        );

        let slice = unsafe { std::slice::from_raw_parts_mut(ptr, count) };

        // Initialize with default values
        for elem in slice.iter_mut() {
            *elem = T::default();
        }

        Ok(slice)
    }

    /// Resets the arena, effectively freeing all allocations.
    ///
    /// This simply rewinds the bump pointer to zero. No destructors are called.
    /// This should be called at the start of each frame processing cycle.
    ///
    /// # Performance
    /// O(1) — just a single atomic store.
    pub fn reset(&self) {
        self.offset.store(0, Ordering::Release);
        self.allocation_count.store(0, Ordering::Relaxed);
    }

    /// Returns the total capacity of the arena in bytes.
    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Returns the number of bytes currently allocated (bump pointer position).
    #[inline]
    pub fn used(&self) -> usize {
        self.offset.load(Ordering::Relaxed)
    }

    /// Returns the number of bytes remaining in the arena.
    #[inline]
    pub fn remaining(&self) -> usize {
        self.capacity.saturating_sub(self.used())
    }

    /// Returns the high-water mark: the peak number of bytes ever allocated
    /// since the arena was created (not reset by `reset()`).
    #[inline]
    pub fn high_water_mark(&self) -> usize {
        self.high_water_mark.load(Ordering::Relaxed)
    }

    /// Returns the number of allocations since the last reset.
    #[inline]
    pub fn allocation_count(&self) -> usize {
        self.allocation_count.load(Ordering::Relaxed)
    }

    /// Returns a diagnostic summary of arena usage.
    pub fn diagnostics(&self) -> ArenaDiagnostics {
        ArenaDiagnostics {
            capacity: self.capacity,
            used: self.used(),
            remaining: self.remaining(),
            high_water_mark: self.high_water_mark(),
            allocation_count: self.allocation_count(),
            utilization_pct: (self.used() as f64 / self.capacity as f64) * 100.0,
        }
    }

    /// Provides a raw pointer to the arena buffer start.
    ///
    /// # Safety
    /// The caller must ensure no concurrent mutations occur to the same memory region.
    pub unsafe fn raw_ptr(&self) -> *mut u8 {
        (*self.buffer.get()).as_mut_ptr()
    }
}

/// Diagnostic snapshot of arena usage statistics.
#[derive(Debug, Clone)]
pub struct ArenaDiagnostics {
    /// Total arena capacity in bytes
    pub capacity: usize,
    /// Currently allocated bytes
    pub used: usize,
    /// Remaining free bytes
    pub remaining: usize,
    /// Peak usage since arena creation
    pub high_water_mark: usize,
    /// Number of allocations since last reset
    pub allocation_count: usize,
    /// Current utilization as a percentage
    pub utilization_pct: f64,
}

impl std::fmt::Display for ArenaDiagnostics {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Arena: {:.1}% used ({}/{} bytes), HWM: {}, allocs: {}",
            self.utilization_pct,
            self.used,
            self.capacity,
            self.high_water_mark,
            self.allocation_count
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_allocation() {
        let arena = MemoryArena::new(4096).unwrap();
        let slice = arena.alloc(100).unwrap();
        assert_eq!(slice.len(), 100);
        assert!(arena.used() >= 100);
    }

    #[test]
    fn test_alignment() {
        let arena = MemoryArena::new(4096).unwrap();
        let s1 = arena.alloc(7).unwrap();
        let ptr1 = s1.as_ptr() as usize;
        assert_eq!(ptr1 % ALIGNMENT, 0);

        let s2 = arena.alloc(13).unwrap();
        let ptr2 = s2.as_ptr() as usize;
        assert_eq!(ptr2 % ALIGNMENT, 0);
    }

    #[test]
    fn test_reset() {
        let arena = MemoryArena::new(4096).unwrap();
        arena.alloc(1000).unwrap();
        assert!(arena.used() >= 1000);
        arena.reset();
        assert_eq!(arena.used(), 0);
        assert!(arena.high_water_mark() >= 1000);
    }

    #[test]
    fn test_oom() {
        let arena = MemoryArena::new(1024).unwrap();
        let result = arena.alloc(2048);
        assert!(result.is_err());
        if let Err(ArenaError::OutOfMemory { requested, .. }) = result {
            assert_eq!(requested, 2048);
        }
    }

    #[test]
    fn test_typed_slice() {
        let arena = MemoryArena::new(4096).unwrap();
        let floats: &mut [f32] = arena.alloc_slice(128).unwrap();
        assert_eq!(floats.len(), 128);
        for &val in floats.iter() {
            assert_eq!(val, 0.0f32);
        }
        floats[0] = 1.5;
        assert_eq!(floats[0], 1.5);
    }

    #[test]
    fn test_invalid_size() {
        let result = MemoryArena::new(0);
        assert!(matches!(result, Err(ArenaError::InvalidSize(0))));
    }

    #[test]
    fn test_diagnostics() {
        let arena = MemoryArena::new(8192).unwrap();
        arena.alloc(1024).unwrap();
        arena.alloc(2048).unwrap();
        let diag = arena.diagnostics();
        assert_eq!(diag.allocation_count, 2);
        assert!(diag.used >= 3072);
        assert!(diag.utilization_pct > 0.0);
    }
}
