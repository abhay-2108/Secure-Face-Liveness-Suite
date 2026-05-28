import os
import sys
from datasets import load_dataset
from PIL import Image

def download_and_format_hf_dataset(dataset_name="nielsr/lfw-tiny", target_dir="p:/Hackathons/NHAI Facial Recognition/data/regional_dataset"):
    print(f"[INFO] Attempting to download '{dataset_name}' from Hugging Face...")
    try:
        # Load the dataset (using a small sample dataset for speed if no specific one is found)
        dataset = load_dataset(dataset_name, split="train")
        print(f"[INFO] Successfully loaded {len(dataset)} images.")
    except Exception as e:
        print(f"[ERROR] Failed to load dataset '{dataset_name}'. Error: {e}")
        print("[INFO] Falling back to generating mock HF identity data for pipeline validation...")
        create_mock_hf_data(target_dir)
        return

    os.makedirs(target_dir, exist_ok=True)
    
    # Check what columns are available
    features = dataset.features.keys()
    image_col = 'image' if 'image' in features else None
    label_col = 'label' if 'label' in features else None

    if not image_col or not label_col:
        print(f"[ERROR] Dataset does not have 'image' and 'label' columns. Available: {features}")
        return

    print("[INFO] Formatting dataset into ImageFolder structure...")
    saved_count = 0
    for idx, item in enumerate(dataset):
        img = item[image_col]
        label = item[label_col]
        
        # Create identity directory
        identity_dir = os.path.join(target_dir, f"hf_identity_{label:04d}")
        os.makedirs(identity_dir, exist_ok=True)
        
        # Save image
        img_path = os.path.join(identity_dir, f"hf_img_{idx:05d}.jpg")
        try:
            # Ensure it's RGB
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(img_path)
            saved_count += 1
        except Exception as e:
            print(f"[WARNING] Could not save image {idx}: {e}")
            
    print(f"[SUCCESS] Downloaded and formatted {saved_count} images into {target_dir}")


def create_mock_hf_data(target_dir):
    import numpy as np
    import cv2
    print("[INFO] Generating mock HF identities (hf_identity_mock_X)...")
    for i in range(2):
        class_dir = os.path.join(target_dir, f"hf_identity_mock_{i+1}")
        os.makedirs(class_dir, exist_ok=True)
        for j in range(3):
            mock_face = np.random.randint(20, 200, (112, 112, 3), dtype=np.uint8)
            cv2.imwrite(os.path.join(class_dir, f"mock_face_{j+1}.jpg"), mock_face)
    print("[INFO] Mock HF data generation complete.")

if __name__ == "__main__":
    download_and_format_hf_dataset()
