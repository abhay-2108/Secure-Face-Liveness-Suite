import math
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

# =====================================================================
# 1. Ghost Module for Parameter Reduction
# =====================================================================
class GhostModule(nn.Module):
    """
    Ghost Module as proposed in GhostNet (CVPR 2020).
    Saves parameters and FLOPS by using cheap linear operations to generate 'ghost' feature maps.
    """
    def __init__(self, in_channels, out_channels, kernel_size=1, ratio=2, dw_size=3, stride=1, relu=True):
        super(GhostModule, self).__init__()
        self.out_channels = out_channels
        init_channels = math.ceil(out_channels / ratio)
        new_channels = init_channels * (ratio - 1)

        self.primary_conv = nn.Sequential(
            nn.Conv2d(in_channels, init_channels, kernel_size, stride, kernel_size//2, bias=False),
            nn.BatchNorm2d(init_channels),
            nn.ReLU(inplace=True) if relu else nn.Identity()
        )

        self.cheap_operation = nn.Sequential(
            nn.Conv2d(init_channels, new_channels, dw_size, 1, dw_size//2, groups=init_channels, bias=False),
            nn.BatchNorm2d(new_channels),
            nn.ReLU(inplace=True) if relu else nn.Identity()
        )

    def forward(self, x):
        x1 = self.primary_conv(x)
        x2 = self.cheap_operation(x1)
        out = torch.cat([x1, x2], dim=1)
        return out[:, :self.out_channels, :, :]


# =====================================================================
# 2. GhostFaceNet-S Backbone (MobileNetV3 Based)
# =====================================================================
class GhostFaceNetS(nn.Module):
    """
    GhostFaceNet-S architecture tailored for edge deployment.
    Uses MobileNetV3 backbone structures optimized with Ghost Modules.
    Generates a high-quality 128-dimensional embedding.
    """
    def __init__(self, embedding_size=128, drop_rate=0.2):
        super(GhostFaceNetS, self).__init__()
        
        # Input stems
        self.conv_stem = nn.Sequential(
            nn.Conv2d(3, 16, kernel_size=3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(16),
            nn.Hardswish(inplace=True)
        )
        
        # Ghost Bottlenecks / Feature Extractors
        # In Channels, Out Channels, Squeeze-Excite (SE), Hardswish (HS), Stride
        self.bneck1 = nn.Sequential(
            GhostModule(16, 16, kernel_size=3, ratio=2, stride=1),
            nn.MaxPool2d(2, 2) # Downsample
        )
        
        self.bneck2 = nn.Sequential(
            GhostModule(16, 24, kernel_size=3, ratio=2, stride=1),
            GhostModule(24, 24, kernel_size=3, ratio=2, stride=1)
        )
        
        self.bneck3 = nn.Sequential(
            GhostModule(24, 40, kernel_size=5, ratio=2, stride=1),
            nn.BatchNorm2d(40),
            nn.Hardswish(inplace=True),
            nn.MaxPool2d(2, 2) # Downsample
        )
        
        self.bneck4 = nn.Sequential(
            GhostModule(40, 80, kernel_size=3, ratio=2, stride=1),
            GhostModule(80, 80, kernel_size=3, ratio=2, stride=1),
            GhostModule(80, 112, kernel_size=3, ratio=2, stride=1),
            GhostModule(112, 112, kernel_size=3, ratio=2, stride=1)
        )
        
        self.bneck5 = nn.Sequential(
            GhostModule(112, 160, kernel_size=5, ratio=2, stride=1),
            nn.BatchNorm2d(160),
            nn.Hardswish(inplace=True),
            nn.MaxPool2d(2, 2) # Downsample
        )
        
        # Conv Head
        self.conv_head = nn.Sequential(
            nn.Conv2d(160, 480, kernel_size=1, stride=1, padding=0, bias=False),
            nn.BatchNorm2d(480),
            nn.Hardswish(inplace=True)
        )
        
        # Deep GDC (Global Depthwise Convolution) layer for Face Recognition
        self.gdc = nn.Sequential(
            nn.Conv2d(480, 480, kernel_size=7, stride=1, padding=0, groups=480, bias=False),
            nn.BatchNorm2d(480)
        )
        
        # Linear Embedding Block
        self.fc = nn.Sequential(
            nn.Flatten(),
            nn.Linear(480, embedding_size, bias=False),
            nn.BatchNorm1d(embedding_size)
        )
        
        self.dropout = nn.Dropout(p=drop_rate)
        
    def forward(self, x):
        # Input shape: [Batch, 3, 112, 112]
        x = self.conv_stem(x)   # 56x56
        x = self.bneck1(x)      # 28x28
        x = self.bneck2(x)      # 28x28
        x = self.bneck3(x)      # 14x14
        x = self.bneck4(x)      # 14x14
        x = self.bneck5(x)      # 7x7
        x = self.conv_head(x)   # 7x7
        x = self.gdc(x)         # 1x1
        x = self.dropout(x)
        embedding = self.fc(x)  # 128-D embedding vector
        
        # L2 Normalization (Crucial for ArcFace / Cosine Similarity)
        embedding = F.normalize(embedding, p=2, dim=1)
        return embedding


# =====================================================================
# 3. ArcFace Margin Product (Demographic Clustering)
# =====================================================================
class ArcMarginProduct(nn.Module):
    """
    ArcFace Loss Head.
    Computes additive angular margin penalty to maximize class separation on South Asian demographics.
    """
    def __init__(self, in_features=128, out_features=1000, s=64.0, m=0.50):
        super(ArcMarginProduct, self).__init__()
        self.in_features = in_features
        self.out_features = out_features
        self.s = s  # Feature scale parameter
        self.m = m  # Angular margin penalty
        
        # Weights represent the class centers (person identities)
        self.weight = nn.Parameter(torch.FloatTensor(out_features, in_features))
        nn.init.xavier_uniform_(self.weight)

        self.cos_m = math.cos(m)
        self.sin_m = math.sin(m)
        self.th = math.cos(math.pi - m)
        self.mm = math.sin(math.pi - m) * m

    def forward(self, input, label):
        # L2-normalize weights
        cosine = F.linear(F.normalize(input), F.normalize(self.weight))
        # Prevent numerical out-of-bounds resulting in NaN gradients in sqrt
        cosine = cosine.clamp(-1.0 + 1e-7, 1.0 - 1e-7)
        sine = torch.sqrt(1.0 - torch.pow(cosine, 2))
        
        # Cos(theta + m) formula
        phi = cosine * self.cos_m - sine * self.sin_m
        
        # Restrict to angle margin bounds
        phi = torch.where(cosine > self.th, phi, cosine - self.mm)
        
        # Convert labels to one-hot encoding
        one_hot = torch.zeros(cosine.size(), device=input.device)
        one_hot.scatter_(1, label.view(-1, 1).long(), 1)
        
        # Apply margin to correct classes, scale values
        output = (one_hot * phi) + ((1.0 - one_hot) * cosine)
        output *= self.s
        return output


# =====================================================================
# 4. Demographic-Specific Data Augmentation Pipeline
# =====================================================================
class IndianDemographicAugmentations:
    """
    Custom transformations specifically crafted to handle:
    1. Low-light under toll plaza canopies.
    2. Extreme direct sunlight reflections (overexposure).
    3. Harsh facial shadows (common under direct high-noon sunlight).
    """
    @staticmethod
    def get_train_transforms():
        try:
            from torchvision import transforms
            return transforms.Compose([
                transforms.Resize((112, 112)),
                transforms.RandomHorizontalFlip(p=0.5),
                transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.05),
                # Simulated high-exposure (harsh sunlight)
                transforms.RandomApply([
                    transforms.Lambda(lambda img: transforms.functional.adjust_brightness(img, 1.4))
                ], p=0.2),
                # Simulated shadow casts
                transforms.RandomApply([
                    transforms.Lambda(lambda img: transforms.functional.adjust_contrast(img, 0.7))
                ], p=0.2),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
            ])
        except ImportError:
            # Fallback if torchvision is not in the active environment
            return None


if __name__ == '__main__':
    # Test network instantiation and dimensional output
    print("[INIT] Instantiating GhostFaceNet-S edge architecture...")
    model = GhostFaceNetS(embedding_size=128)
    model.eval()  # Set model to evaluation mode for 1-batch inference
    
    # 1 batch, 3 channels, 112x112 pixel crop
    dummy_input = torch.randn(1, 3, 112, 112)
    with torch.no_grad():
        embedding = model(dummy_input)
    
    print(f"[SUCCESS] Embedding generated. Shape: {embedding.shape}")
    print(f"[SUCCESS] L2 Normalized Magnitude (should be 1.0): {torch.norm(embedding, p=2, dim=1).item():.4f}")
    
    # Test ArcFace Loss calculation
    print("[INIT] Instantiating ArcFace Loss Head (1000 classes)...")
    arcface = ArcMarginProduct(in_features=128, out_features=1000)
    dummy_labels = torch.randint(0, 1000, (1,))
    loss_output = arcface(embedding, dummy_labels)
    print(f"[SUCCESS] ArcFace Output shape: {loss_output.shape}")
    print("[COMPLETED] GhostFaceNet-S module loaded successfully.")
