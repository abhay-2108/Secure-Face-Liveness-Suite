"""
download_kyc_dataset.py
========================
Downloads the UniqueData/asian-kyc-photo-dataset from Hugging Face
and saves images into the data/ folder organized by person identity.

Usage:
    python download_kyc_dataset.py
"""
import os
import sys
from datasets import load_dataset
from PIL import Image

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "data", "asian_kyc_photos")

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("="*60)
    print("  Downloading: UniqueData/asian-kyc-photo-dataset")
    print(f"  Saving to  : {os.path.abspath(OUTPUT_DIR)}")
    print("="*60)

    print("Attempting download (may take a few minutes on first run)...\n")

    # Retry up to 3 times in case of network timeouts
    for attempt in range(1, 4):
        try:
            ds = load_dataset("UniqueData/asian-kyc-photo-dataset")
            break
        except Exception as e:
            print(f"  [RETRY {attempt}/3] {e}")
            if attempt == 3:
                print("[FATAL] Could not download dataset after 3 attempts.")
                sys.exit(1)
            import time
            time.sleep(5)

    total = 0
    for split_name, split_data in ds.items():
        print(f"\n[SPLIT] '{split_name}' -> {len(split_data)} samples")
        for idx, sample in enumerate(split_data):
            # Try to extract image and label
            img = None
            label = "unknown"

            # HF imagefolder datasets typically have 'image' and 'label' columns
            if "image" in sample:
                img = sample["image"]
            if "label" in sample:
                label = str(sample["label"])

            if img is None:
                continue

            # Create subdirectory per identity/label
            label_dir = os.path.join(OUTPUT_DIR, f"identity_{label}")
            os.makedirs(label_dir, exist_ok=True)

            # Save image
            filename = f"{split_name}_{idx:05d}.jpg"
            filepath = os.path.join(label_dir, filename)

            if isinstance(img, Image.Image):
                img.save(filepath, "JPEG", quality=95)
            else:
                # Fallback if it is raw bytes
                with open(filepath, "wb") as f:
                    f.write(img)

            total += 1
            if total % 100 == 0:
                print(f"  Saved {total} images...")

    print(f"\n[DONE] Total images saved: {total}")
    print(f"       Location: {os.path.abspath(OUTPUT_DIR)}")

if __name__ == "__main__":
    main()
