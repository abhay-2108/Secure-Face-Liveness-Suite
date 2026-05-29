"""
train_blended.py — Blended Fine-Tuning Pipeline
=================================================
Loads both:
1. data/regional_dataset/ (102 identities, South Asian actors & regional classes)
2. data/asian_kyc_photos/ (5 identities, clean Asian KYC portraits)

Combines them in memory using a custom zero-copy BlendedDataset wrapper,
offsets class labels dynamically (107 total classes), and fine-tunes
GhostFaceNet-S with ArcFace angular margin loss on CUDA.

Saves the trained model back to edge_vision_engine/checkpoints/ghostfacenet_epoch_3.pt.
"""

import os
import sys
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision.datasets import ImageFolder
import torchvision.transforms as transforms

# Adjust Python path to load local modules
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "models"))
from ghostfacenet import GhostFaceNetS, ArcMarginProduct

PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REGIONAL_PATH = os.path.join(PROJECT_DIR, "data", "regional_dataset")
KYC_PATH = os.path.join(PROJECT_DIR, "data", "asian_kyc_photos")
CHECKPOINT_PATH = os.path.join(PROJECT_DIR, "edge_vision_engine", "checkpoints", "ghostfacenet_epoch_3.pt")

class BlendedDataset(Dataset):
    """
    Combines two torchvision ImageFolder datasets in memory.
    Offsets the class labels of the second dataset by the number of classes in the first.
    """
    def __init__(self, ds1, ds2):
        self.ds1 = ds1
        self.ds2 = ds2
        self.offset = len(ds1.classes)
        self.classes = ds1.classes + ds2.classes
        
    def __len__(self):
        return len(self.ds1) + len(self.ds2)
        
    def __getitem__(self, idx):
        if idx < len(self.ds1):
            img, label = self.ds1[idx]
            return img, label
        else:
            img, label = self.ds2[idx - len(self.ds1)]
            return img, label + self.offset

def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("=" * 70)
    print("  NHAI EDGE AI — BLENDED DATASET FINE-TUNING PIPELINE")
    print("=" * 70)
    print(f"  Device   : {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}")
    
    # ── 1. Set Up Transforms ──────────────────────────────────────────────────
    # Focus on training data augmentations
    train_transforms = transforms.Compose([
        transforms.Resize((112, 112)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]) # maps [0,1] to [-1,1]
    ])
    
    # ── 2. Load Datasets ──────────────────────────────────────────────────────
    print("\n[1/4] Loading constituent datasets...")
    if not os.path.exists(REGIONAL_PATH):
        print(f"      [ERROR] Regional dataset directory not found at: {REGIONAL_PATH}")
        sys.exit(1)
    if not os.path.exists(KYC_PATH):
        print(f"      [ERROR] KYC dataset directory not found at: {KYC_PATH}")
        sys.exit(1)
        
    ds_regional = ImageFolder(root=REGIONAL_PATH, transform=train_transforms)
    ds_kyc = ImageFolder(root=KYC_PATH, transform=train_transforms)
    
    print(f"      Loaded Regional Dataset: {len(ds_regional)} samples across {len(ds_regional.classes)} classes.")
    print(f"      Loaded KYC Dataset     : {len(ds_kyc)} samples across {len(ds_kyc.classes)} classes.")
    
    # Merge datasets
    blended_ds = BlendedDataset(ds_regional, ds_kyc)
    total_classes = len(blended_ds.classes)
    print(f"      Blended Dataset Total  : {len(blended_ds)} samples across {total_classes} merged classes.")
    
    loader = DataLoader(blended_ds, batch_size=16, shuffle=True, pin_memory=True if torch.cuda.is_available() else False)
    
    # ── 3. Instantiate Models & Optimizer ─────────────────────────────────────
    print("\n[2/4] Instantiating GhostFaceNet-S with ArcFace Head...")
    model = GhostFaceNetS(embedding_size=128).to(device)
    
    # If a checkpoint exists, load weights as a baseline
    if os.path.exists(CHECKPOINT_PATH):
        try:
            print("      Loading existing checkpoint weights as baseline...")
            ckpt = torch.load(CHECKPOINT_PATH, map_location=device)
            # Filter state dict keys in case they differ
            model.load_state_dict(ckpt["model_state_dict"])
            print("      Existing weights successfully loaded.")
        except Exception as e:
            print(f"      [WARNING] Could not load baseline weights: {e}. Starting fresh.")

    # ArcFace Margin Product Head
    arcface = ArcMarginProduct(
        in_features=128,
        out_features=total_classes,
        s=64.0, # scale factor
        m=0.50  # margin
    ).to(device)
    
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(list(model.parameters()) + list(arcface.parameters()), lr=1e-3, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=15)
    
    # ── 4. Training Loop ──────────────────────────────────────────────────────
    print("\n[3/4] Fine-tuning model on CUDA...")
    model.train()
    
    epochs = 15
    for epoch in range(epochs):
        running_loss = 0.0
        correct = 0
        total = 0
        
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)
            
            embeddings = model(images)
            outputs = arcface(embeddings, labels)
            loss = criterion(outputs, labels)
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item() * images.size(0)
            _, predicted = torch.max(outputs, 1)
            correct += (predicted == labels).sum().item()
            total += labels.size(0)
            
        scheduler.step()
        epoch_loss = running_loss / total
        epoch_acc = (correct / total) * 100
        print(f"      Epoch [{epoch+1:02d}/{epochs:02d}] -> Loss: {epoch_loss:.4f} | Blended Accuracy: {epoch_acc:.2f}%")
        
    # ── 5. Save Finished Weights ──────────────────────────────────────────────
    print("\n[4/4] Saving updated fine-tuned model checkpoint...")
    model.eval()
    os.makedirs(os.path.dirname(CHECKPOINT_PATH), exist_ok=True)
    checkpoint_payload = {
        'epoch': 2, # Lock to "epoch 3" (0-indexed 2) to preserve script compatibility
        'model_state_dict': model.state_dict(),
        'arcface_state_dict': arcface.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'loss': epoch_loss,
    }
    torch.save(checkpoint_payload, CHECKPOINT_PATH)
    print(f"      [SAVED] Checkpoint backup -> {CHECKPOINT_PATH}")
    print("\n" + "=" * 70)
    print("  BLENDED DEMOGRAPHIC FINE-TUNING PIPELINE COMPLETE!")
    print("=" * 70)

if __name__ == "__main__":
    main()
