//! # Thermal Governor
//!
//! Dynamic FPS throttle that monitors device temperature and reduces ML inference
//! frequency when the device heats up. Camera preview always runs at full framerate;
//! only ML processing (detection, liveness, recognition) is throttled.
//!
//! ## Throttle Tiers
//! | Temperature      | Target ML FPS | Description                       |
//! |-----------------|---------------|-----------------------------------|
//! | < 35°C          | 30 fps        | Full speed: all frames processed  |
//! | 35-40°C         | 20 fps        | Mild throttle: skip every 3rd     |
//! | 40-45°C         | 10 fps        | Moderate: process every 3rd frame |
//! | 45-50°C         | 5 fps         | Heavy: process every 6th frame    |
//! | > 50°C          | 2 fps         | Critical: emergency minimum       |
//!
//! ## Platform Temperature Sources
//! - **Android**: Reads from `/sys/class/thermal/thermal_zone*/temp`
//! - **iOS**: Uses `ProcessInfo.thermalState` via FFI callback
//! - **Fallback**: Returns 25°C (room temperature) when source unavailable

use std::time::{Duration, Instant};

/// Thermal governor configuration
#[derive(Debug, Clone)]
pub struct ThermalConfig {
    /// Temperature threshold for mild throttling (°C)
    pub mild_threshold: f32,
    /// Temperature threshold for moderate throttling (°C)
    pub moderate_threshold: f32,
    /// Temperature threshold for heavy throttling (°C)
    pub heavy_threshold: f32,
    /// Temperature threshold for critical throttling (°C)
    pub critical_threshold: f32,
    /// How often to poll device temperature
    pub poll_interval: Duration,
    /// Hysteresis margin to prevent oscillation at boundaries (°C)
    pub hysteresis: f32,
}

impl Default for ThermalConfig {
    fn default() -> Self {
        Self {
            mild_threshold: 35.0,
            moderate_threshold: 40.0,
            heavy_threshold: 45.0,
            critical_threshold: 50.0,
            poll_interval: Duration::from_secs(2),
            hysteresis: 1.5,
        }
    }
}

/// The current throttle tier based on device temperature
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThrottleTier {
    /// Full speed: all frames are processed (< 35°C)
    Normal,
    /// Mild throttle: skip some frames (35-40°C)
    Mild,
    /// Moderate throttle: process every 3rd frame (40-45°C)
    Moderate,
    /// Heavy throttle: process every 6th frame (45-50°C)
    Heavy,
    /// Critical: emergency minimum rate (> 50°C)
    Critical,
}

impl ThrottleTier {
    /// Returns the target ML processing FPS for this tier.
    pub fn target_fps(&self) -> u32 {
        match self {
            ThrottleTier::Normal => 30,
            ThrottleTier::Mild => 20,
            ThrottleTier::Moderate => 10,
            ThrottleTier::Heavy => 5,
            ThrottleTier::Critical => 2,
        }
    }

    /// Returns the frame skip interval. A value of 1 means process every frame.
    pub fn skip_interval(&self) -> u32 {
        match self {
            ThrottleTier::Normal => 1,
            ThrottleTier::Mild => 2,
            ThrottleTier::Moderate => 3,
            ThrottleTier::Heavy => 6,
            ThrottleTier::Critical => 15,
        }
    }

    /// Returns a human-readable label for this tier.
    pub fn label(&self) -> &'static str {
        match self {
            ThrottleTier::Normal => "NORMAL",
            ThrottleTier::Mild => "MILD_THROTTLE",
            ThrottleTier::Moderate => "MODERATE_THROTTLE",
            ThrottleTier::Heavy => "HEAVY_THROTTLE",
            ThrottleTier::Critical => "CRITICAL_THROTTLE",
        }
    }
}

/// Snapshot of thermal governor state for diagnostics
#[derive(Debug, Clone)]
pub struct ThermalSnapshot {
    /// Current device temperature in °C
    pub temperature_c: f32,
    /// Current throttle tier
    pub tier: ThrottleTier,
    /// Target ML FPS at current tier
    pub target_fps: u32,
    /// Frame skip interval
    pub skip_interval: u32,
    /// Total frames seen since engine start
    pub total_frames: u64,
    /// Total frames that were actually processed (not skipped)
    pub processed_frames: u64,
    /// Temperature trend (positive = heating, negative = cooling)
    pub trend_c_per_sec: f32,
}

/// The thermal governor that manages dynamic FPS throttling.
///
/// Call `should_process_frame()` for each camera frame to determine whether
/// to run the ML pipeline on it. Camera preview always displays every frame;
/// this only controls whether the expensive ML inference runs.
pub struct ThermalGovernor {
    config: ThermalConfig,
    /// Current throttle tier
    current_tier: ThrottleTier,
    /// Last polled temperature (°C)
    current_temp: f32,
    /// Previous temperature for trend calculation
    prev_temp: f32,
    /// When the temperature was last polled
    last_poll: Instant,
    /// Frame counter (monotonically increasing, never reset)
    frame_counter: u64,
    /// Number of frames actually processed
    processed_counter: u64,
    /// Optional callback for reading device temperature (set by platform layer)
    temp_reader: Option<Box<dyn Fn() -> f32 + Send>>,
    /// Temperature history ring buffer for trend analysis (last 10 readings)
    temp_history: [f32; 10],
    /// Current position in the temperature ring buffer
    temp_history_idx: usize,
}

impl ThermalGovernor {
    /// Creates a new thermal governor with the specified configuration.
    ///
    /// # Arguments
    /// * `config` - Thermal throttling configuration
    pub fn new(config: ThermalConfig) -> Self {
        Self {
            config,
            current_tier: ThrottleTier::Normal,
            current_temp: 25.0, // Default room temperature
            prev_temp: 25.0,
            last_poll: Instant::now(),
            frame_counter: 0,
            processed_counter: 0,
            temp_reader: None,
            temp_history: [25.0; 10],
            temp_history_idx: 0,
        }
    }

    /// Creates a thermal governor with default settings.
    pub fn with_defaults() -> Self {
        Self::new(ThermalConfig::default())
    }

    /// Sets the platform-specific temperature reader callback.
    ///
    /// On Android, this should read from `/sys/class/thermal/thermal_zone*/temp`.
    /// On iOS, this maps `ProcessInfo.thermalState` to approximate °C values.
    /// The callback should return the temperature in degrees Celsius.
    ///
    /// # Arguments
    /// * `reader` - Closure that returns the current device temperature in °C
    pub fn set_temp_reader<F>(&mut self, reader: F)
    where
        F: Fn() -> f32 + Send + 'static,
    {
        self.temp_reader = Some(Box::new(reader));
    }

    /// Manually sets the current device temperature.
    ///
    /// Use this when temperature is provided from the platform layer via FFI
    /// rather than read through a callback.
    ///
    /// # Arguments
    /// * `temp_c` - Current device temperature in degrees Celsius
    pub fn set_temperature(&mut self, temp_c: f32) {
        self.prev_temp = self.current_temp;
        self.current_temp = temp_c;
        self.record_temp(temp_c);
        self.update_tier();
    }

    /// Determines whether the current frame should be processed by the ML pipeline.
    ///
    /// This is the primary API called for each camera frame. It handles:
    /// 1. Periodic temperature polling (if a reader callback is set)
    /// 2. Tier classification with hysteresis
    /// 3. Frame skip decision based on the current tier
    ///
    /// # Returns
    /// `true` if the ML pipeline should run on this frame, `false` to skip.
    ///
    /// # Example
    /// ```ignore
    /// let mut governor = ThermalGovernor::with_defaults();
    /// // In your frame processing loop:
    /// if governor.should_process_frame() {
    ///     engine.run_detection(&frame)?;
    ///     engine.run_liveness(&frame, &face)?;
    /// }
    /// ```
    pub fn should_process_frame(&mut self) -> bool {
        self.frame_counter += 1;

        // Poll temperature at the configured interval
        if self.last_poll.elapsed() >= self.config.poll_interval {
            self.poll_temperature();
            self.last_poll = Instant::now();
        }

        // Apply frame skip based on current tier
        let skip = self.current_tier.skip_interval();
        let should_process = self.frame_counter.is_multiple_of(skip as u64);

        if should_process {
            self.processed_counter += 1;
        }

        should_process
    }

    /// Polls the device temperature using the registered reader callback.
    fn poll_temperature(&mut self) {
        if let Some(reader) = &self.temp_reader {
            let temp = reader();
            self.prev_temp = self.current_temp;
            self.current_temp = temp;
            self.record_temp(temp);
            self.update_tier();
        } else {
            // Try reading from Android sysfs thermal zone
            self.try_read_sysfs_temperature();
        }
    }

    /// Attempts to read temperature from Linux/Android sysfs thermal zone.
    ///
    /// Reads from `/sys/class/thermal/thermal_zone0/temp` which reports
    /// temperature in millidegrees Celsius (e.g., 42000 = 42.0°C).
    fn try_read_sysfs_temperature(&mut self) {
        // This runs on Android where sysfs is available
        #[cfg(target_os = "android")]
        {
            if let Ok(content) = std::fs::read_to_string("/sys/class/thermal/thermal_zone0/temp") {
                if let Ok(millidegrees) = content.trim().parse::<i64>() {
                    let temp_c = millidegrees as f32 / 1000.0;
                    self.prev_temp = self.current_temp;
                    self.current_temp = temp_c;
                    self.record_temp(temp_c);
                    self.update_tier();
                    return;
                }
            }
        }

        // Fallback: no temperature source available, keep current
        // On non-Android platforms, temperature stays at default or manually set value
    }

    /// Records a temperature reading into the ring buffer for trend analysis.
    fn record_temp(&mut self, temp: f32) {
        self.temp_history[self.temp_history_idx] = temp;
        self.temp_history_idx = (self.temp_history_idx + 1) % self.temp_history.len();
    }

    /// Updates the throttle tier based on current temperature with hysteresis.
    ///
    /// Hysteresis prevents rapid oscillation at tier boundaries: when cooling down,
    /// the tier won't change until the temperature drops below `threshold - hysteresis`.
    fn update_tier(&mut self) {
        let temp = self.current_temp;
        let hyst = self.config.hysteresis;

        let new_tier = if temp >= self.config.critical_threshold {
            ThrottleTier::Critical
        } else if temp >= self.config.heavy_threshold {
            ThrottleTier::Heavy
        } else if temp >= self.config.moderate_threshold {
            ThrottleTier::Moderate
        } else if temp >= self.config.mild_threshold {
            ThrottleTier::Mild
        } else {
            ThrottleTier::Normal
        };

        // Apply hysteresis: only move to a lower tier if temp is below threshold - hysteresis
        let apply = match (&self.current_tier, &new_tier) {
            // Escalating (getting hotter) always applies immediately
            (old, new) if (*new as u8) > (*old as u8) => true,
            // De-escalating (cooling down) requires hysteresis margin
            (ThrottleTier::Critical, ThrottleTier::Heavy) => {
                temp < self.config.critical_threshold - hyst
            }
            (ThrottleTier::Heavy, ThrottleTier::Moderate) => {
                temp < self.config.heavy_threshold - hyst
            }
            (ThrottleTier::Moderate, ThrottleTier::Mild) => {
                temp < self.config.moderate_threshold - hyst
            }
            (ThrottleTier::Mild, ThrottleTier::Normal) => temp < self.config.mild_threshold - hyst,
            // Multi-tier drops also check hysteresis
            _ => {
                let threshold_for_new = match new_tier {
                    ThrottleTier::Normal => self.config.mild_threshold - hyst,
                    ThrottleTier::Mild => self.config.moderate_threshold - hyst,
                    ThrottleTier::Moderate => self.config.heavy_threshold - hyst,
                    ThrottleTier::Heavy => self.config.critical_threshold - hyst,
                    ThrottleTier::Critical => f32::MAX,
                };
                temp < threshold_for_new
            }
        };

        if apply {
            if self.current_tier != new_tier {
                log::info!(
                    "Thermal tier change: {:?} -> {:?} (temp: {:.1}°C, target: {} fps)",
                    self.current_tier,
                    new_tier,
                    temp,
                    new_tier.target_fps()
                );
            }
            self.current_tier = new_tier;
        }
    }

    /// Computes the temperature trend in °C/second.
    ///
    /// Positive values indicate the device is heating up.
    /// Negative values indicate cooling.
    pub fn temperature_trend(&self) -> f32 {
        let elapsed = self.config.poll_interval.as_secs_f32().max(0.001);
        (self.current_temp - self.prev_temp) / elapsed
    }

    /// Returns the current throttle tier.
    pub fn current_tier(&self) -> ThrottleTier {
        self.current_tier
    }

    /// Returns the current temperature in °C.
    pub fn current_temperature(&self) -> f32 {
        self.current_temp
    }

    /// Returns the current target FPS.
    pub fn target_fps(&self) -> u32 {
        self.current_tier.target_fps()
    }

    /// Returns a complete diagnostic snapshot of the thermal governor state.
    pub fn snapshot(&self) -> ThermalSnapshot {
        ThermalSnapshot {
            temperature_c: self.current_temp,
            tier: self.current_tier,
            target_fps: self.current_tier.target_fps(),
            skip_interval: self.current_tier.skip_interval(),
            total_frames: self.frame_counter,
            processed_frames: self.processed_counter,
            trend_c_per_sec: self.temperature_trend(),
        }
    }

    /// Returns the average temperature over the ring buffer history.
    pub fn average_temperature(&self) -> f32 {
        let sum: f32 = self.temp_history.iter().sum();
        sum / self.temp_history.len() as f32
    }

    /// Returns the processing efficiency ratio (processed / total frames).
    pub fn efficiency_ratio(&self) -> f64 {
        if self.frame_counter == 0 {
            return 1.0;
        }
        self.processed_counter as f64 / self.frame_counter as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier_classification_normal() {
        let mut gov = ThermalGovernor::with_defaults();
        gov.set_temperature(25.0);
        assert_eq!(gov.current_tier(), ThrottleTier::Normal);
        assert_eq!(gov.target_fps(), 30);
    }

    #[test]
    fn test_tier_classification_mild() {
        let mut gov = ThermalGovernor::with_defaults();
        gov.set_temperature(37.0);
        assert_eq!(gov.current_tier(), ThrottleTier::Mild);
        assert_eq!(gov.target_fps(), 20);
    }

    #[test]
    fn test_tier_classification_moderate() {
        let mut gov = ThermalGovernor::with_defaults();
        gov.set_temperature(42.0);
        assert_eq!(gov.current_tier(), ThrottleTier::Moderate);
        assert_eq!(gov.target_fps(), 10);
    }

    #[test]
    fn test_tier_classification_heavy() {
        let mut gov = ThermalGovernor::with_defaults();
        gov.set_temperature(47.0);
        assert_eq!(gov.current_tier(), ThrottleTier::Heavy);
        assert_eq!(gov.target_fps(), 5);
    }

    #[test]
    fn test_tier_classification_critical() {
        let mut gov = ThermalGovernor::with_defaults();
        gov.set_temperature(55.0);
        assert_eq!(gov.current_tier(), ThrottleTier::Critical);
        assert_eq!(gov.target_fps(), 2);
    }

    #[test]
    fn test_frame_skip_normal() {
        let mut gov = ThermalGovernor::with_defaults();
        gov.set_temperature(25.0);
        // Normal tier: every frame should be processed
        for _ in 0..10 {
            assert!(gov.should_process_frame());
        }
    }

    #[test]
    fn test_frame_skip_mild() {
        let mut gov = ThermalGovernor::with_defaults();
        gov.set_temperature(37.0);
        // Mild tier: skip every 2nd frame
        let processed: u32 = (0..10).map(|_| gov.should_process_frame() as u32).sum();
        assert!(
            processed == 5,
            "Expected 5 processed frames, got {}",
            processed
        );
    }

    #[test]
    fn test_hysteresis_prevents_oscillation() {
        let mut gov = ThermalGovernor::with_defaults();
        // Heat up past mild threshold
        gov.set_temperature(36.0);
        assert_eq!(gov.current_tier(), ThrottleTier::Mild);

        // Cool down just slightly below threshold (within hysteresis)
        gov.set_temperature(34.5);
        // Should NOT drop to Normal due to 1.5°C hysteresis
        assert_eq!(gov.current_tier(), ThrottleTier::Mild);

        // Cool below threshold - hysteresis
        gov.set_temperature(33.0);
        assert_eq!(gov.current_tier(), ThrottleTier::Normal);
    }

    #[test]
    fn test_efficiency_ratio() {
        let mut gov = ThermalGovernor::with_defaults();
        gov.set_temperature(25.0);
        for _ in 0..100 {
            gov.should_process_frame();
        }
        assert!((gov.efficiency_ratio() - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_snapshot() {
        let mut gov = ThermalGovernor::with_defaults();
        gov.set_temperature(42.0);
        for _ in 0..10 {
            gov.should_process_frame();
        }
        let snap = gov.snapshot();
        assert_eq!(snap.tier, ThrottleTier::Moderate);
        assert!((snap.temperature_c - 42.0).abs() < 0.01);
        assert_eq!(snap.total_frames, 10);
    }
}
