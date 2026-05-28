import os
import sys
import io
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision.datasets import ImageFolder
from dotenv import load_dotenv
from huggingface_hub import HfApi, login

# Import model structures from local module
from ghostfacenet import GhostFaceNetS, ArcMarginProduct, IndianDemographicAugmentations

class NHAITrainingPipeline:
    """
    Handles the fine-tuning of GhostFaceNet-S using ArcFace additive angular margin loss.
    Tuned specifically to cluster South Asian demographics under canopy shadow environments.
    """
    def __init__(self, dataset_path: str, embedding_size=128, batch_size=32, lr=1e-3, epochs=10, verbose=2):
        self.dataset_path = dataset_path
        self.embedding_size = embedding_size
        self.batch_size = batch_size
        self.lr = lr
        self.epochs = epochs
        self.verbose = verbose
        
        # Enforce GPU acceleration if CUDA is available (NVIDIA GPU / CUDA cores)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[PIPELINE] Training device set to: {self.device}")
        
        # Setup Hugging Face Hub Authentication
        load_dotenv(dotenv_path="p:/Hackathons/NHAI Facial Recognition/.env")
        hf_token = os.getenv("HF_TOKEN")
        if hf_token:
            login(token=hf_token)
            self.api = HfApi()
            self.api.create_repo(repo_id="raj0120/edge-face-pipeline", exist_ok=True, private=False)
            print("[INFO] Successfully authenticated to Hugging Face Hub.")
        else:
            print("[WARNING] HF_TOKEN not found in .env file. Direct uploads will fail.")

    def prepare_data(self):
        """
        Loads the blended regional dataset using specialized lighting augmentations
        (shadow casts, direct sunlight adjustment, and color jittering).
        """
        if not os.path.exists(self.dataset_path) or not os.listdir(self.dataset_path):
            print(f"[WARNING] Regional dataset folder '{self.dataset_path}' not found or empty.")
            print("[INFO] Creating mock dataset directory structure for bootstrapping...")
            self._create_mock_dataset()

        # Load augmentations
        train_transforms = IndianDemographicAugmentations.get_train_transforms()
        if train_transforms is None:
            raise ImportError("Torchvision is required to compile augmentations.")

        print(f"[DATA] Reading training data from: {self.dataset_path}")
        self.train_dataset = ImageFolder(root=self.dataset_path, transform=train_transforms)
        self.num_classes = len(self.train_dataset.classes)
        print(f"[DATA] Successfully loaded {len(self.train_dataset)} regional face samples across {self.num_classes} identities.")

        self.train_loader = DataLoader(
            self.train_dataset, 
            batch_size=self.batch_size, 
            shuffle=True, 
            num_workers=0, # Set to 4 on multi-core server environments
            pin_memory=True if torch.cuda.is_available() else False
        )

    def run_fine_tuning(self):
        """
        Runs the complete PyTorch training loop over GhostFaceNet and the ArcFace head.
        """
        print("\n=== Initializing GhostFaceNet-S ArcFace Fine-Tuning Pipeline ===")
        self.prepare_data()

        # 1. Instantiate the GhostFaceNet-S Backbone
        model = GhostFaceNetS(embedding_size=self.embedding_size).to(self.device)
        model.train() # Set to training mode (BatchNorm running stats active)

        # 2. Instantiate the ArcFace Loss Head (Dynamic classes based on dataset directory)
        arcface_head = ArcMarginProduct(
            in_features=self.embedding_size, 
            out_features=self.num_classes, 
            s=64.0, # Feature scale parameter
            m=0.50  # Additive angular margin penalty
        ).to(self.device)

        # 3. Define Optimizer (AdamW for fast convergence) and loss criterion
        criterion = nn.CrossEntropyLoss()
        optimizer = optim.AdamW(
            list(model.parameters()) + list(arcface_head.parameters()), 
            lr=self.lr, 
            weight_decay=1e-4
        )
        
        # Cosine Annealing learning rate decay scheduler
        scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=self.epochs)

        # 4. Training Loop
        for epoch in range(self.epochs):
            running_loss = 0.0
            correct_predictions = 0
            correct_predictions_raw = 0
            total_samples = 0

            print(f"\n[EPOCH {epoch + 1}/{self.epochs}] Learning Rate: {scheduler.get_last_lr()[0]:.6f}")

            for batch_idx, (images, labels) in enumerate(self.train_loader):
                images = images.to(self.device)
                labels = labels.to(self.device)

                # Forward pass: Generate 128-D normalized embedding vectors
                embeddings = model(images)
                
                # ArcFace loss forward: Computes angular margin similarity logits
                outputs = arcface_head(embeddings, labels)
                
                loss = criterion(outputs, labels)

                # Zero gradients, backward pass, optimizer step
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

                # Metrics calculation
                running_loss += loss.item() * images.size(0)
                _, predicted = torch.max(outputs, 1)
                correct_predictions += (predicted == labels).sum().item()
                total_samples += labels.size(0)

                # Raw cosine similarity accuracy (unpenalized) for true progress monitoring
                with torch.no_grad():
                    raw_cosine = F.linear(F.normalize(embeddings), F.normalize(arcface_head.weight))
                    _, predicted_raw = torch.max(raw_cosine, 1)
                    correct_raw = (predicted_raw == labels).sum().item()
                    correct_predictions_raw += correct_raw

                # Print mini-batch status based on verbose level
                if self.verbose == 2:
                    batch_acc = (predicted == labels).sum().item() / labels.size(0) * 100
                    batch_acc_raw = correct_raw / labels.size(0) * 100
                    running_avg_loss = running_loss / total_samples
                    running_avg_acc = (correct_predictions / total_samples) * 100
                    running_avg_acc_raw = (correct_predictions_raw / total_samples) * 100
                    print(f"  Batch [{batch_idx + 1}/{len(self.train_loader)}] -> Loss: {loss.item():.4f} (Avg: {running_avg_loss:.4f}) | Penalized Acc: {batch_acc:.1f}% (Avg: {running_avg_acc:.1f}%) | True Acc: {batch_acc_raw:.1f}% (Avg: {running_avg_acc_raw:.1f}%)")
                elif self.verbose == 1:
                    if (batch_idx + 1) % 10 == 0 or (batch_idx + 1) == len(self.train_loader):
                        batch_acc = (predicted == labels).sum().item() / labels.size(0) * 100
                        batch_acc_raw = correct_raw / labels.size(0) * 100
                        print(f"  Batch [{batch_idx + 1}/{len(self.train_loader)}] -> Loss: {loss.item():.4f} | Penalized Acc: {batch_acc:.1f}% | True Acc: {batch_acc_raw:.1f}%")

            # Epoch summary metrics
            epoch_loss = running_loss / total_samples
            epoch_acc = (correct_predictions / total_samples) * 100
            epoch_acc_raw = (correct_predictions_raw / total_samples) * 100
            print(f"[SUMMARY] Epoch {epoch + 1} completed -> Average Loss: {epoch_loss:.4f} | Penalized Accuracy: {epoch_acc:.2f}% | True Accuracy: {epoch_acc_raw:.2f}%")

            # Step the learning rate decay scheduler
            scheduler.step()

            # Save check-points to local disk folder first to avoid losing progress
            local_checkpoint_path = f"edge_vision_engine/checkpoints/ghostfacenet_epoch_{epoch + 1}.pt"
            os.makedirs(os.path.dirname(local_checkpoint_path), exist_ok=True)
            checkpoint_payload = {
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'arcface_state_dict': arcface_head.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'loss': epoch_loss,
            }
            torch.save(checkpoint_payload, local_checkpoint_path)
            print(f"[SAVE] Saved local checkpoint backup to: {local_checkpoint_path}")
            
            repo_id = "raj0120/edge-face-pipeline"
            filename = f"ghostfacenet_epoch_{epoch + 1}.pt"
            print(f"[SAVE] Uploading {filename} directly to Hugging Face Hub ({repo_id})...")
            
            try:
                self.api.upload_file(
                    path_or_fileobj=local_checkpoint_path,
                    path_in_repo=filename,
                    repo_id=repo_id,
                    commit_message=f"Upload checkpoint epoch {epoch+1}"
                )
                print(f"[SAVE] Checkpoint uploaded successfully to Hugging Face Hub!")
            except Exception as e:
                print(f"[ERROR] Failed to upload checkpoint: {e}. (Local backup is safe at {local_checkpoint_path})")

        print("\n[SUCCESS] GhostFaceNet-S fine-tuning complete! Models ready for ONNX/TFLite export.")

    def _create_mock_dataset(self):
        """
        Helper utility to bootstrap directory and create a tiny synthetic database 
        if no dataset is present, allowing standard verification run tests.
        """
        import numpy as np
        try:
            import cv2
            # Create directories for 3 dummy identities (classes)
            for i in range(3):
                class_dir = os.path.join(self.dataset_path, f"id_000{i+1}")
                os.makedirs(class_dir, exist_ok=True)
                # Write 5 mock face crops per class (containing moderate pixel gradients)
                for j in range(5):
                    mock_face = np.random.randint(50, 200, (112, 112, 3), dtype=np.uint8)
                    cv2.imwrite(os.path.join(class_dir, f"face_{j+1}.jpg"), mock_face)
            print("[INFO] Created dummy dataset directory with 3 mock identity categories.")
        except Exception as e:
            print(f"[ERROR] Failed writing mock face images: {e}")


if __name__ == "__main__":
    # Test path definitions
    pipeline = NHAITrainingPipeline(
        dataset_path="p:/Hackathons/NHAI Facial Recognition/data/regional_dataset",
        batch_size=64,  # Set optimal batch size to leverage RTX 4050 GPU cores fully
        epochs=3,       # Speed verification
        verbose=2       # High-verbosity logging requested
    )
    
    # Run the fine-tuning process
    pipeline.run_fine_tuning()
