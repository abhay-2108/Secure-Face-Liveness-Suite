import sys
import os

target_string = b"../../../../src/main/jniLibs/arm64-v8a/libopen_face_engine.so"
replacement = b"libopen_face_engine.so" + b"\x00" * (len(target_string) - len(b"libopen_face_engine.so"))

def patch_file(filepath):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return False
    
    with open(filepath, 'rb') as f:
        data = f.read()
    
    if target_string not in data:
        print(f"Target string not found in {filepath}")
        return False
        
    data = data.replace(target_string, replacement)
    
    with open(filepath, 'wb') as f:
        f.write(data)
    print(f"Successfully patched {filepath}")
    return True

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: patch_elf.py <path_to_so>")
        sys.exit(1)
    patch_file(sys.argv[1])
