import os
import sys
import torch

sys.path.append(os.path.join(os.path.dirname(__file__), "edge_vision_engine", "models"))

from ghostfacenet import GhostFaceNetS
from liveness import MiniFASNetV1SE
from detector import LinzaerDetectorRFB

def export_ghostfacenet(model_path, output_path):
    print(f"Exporting GhostFaceNet from {model_path} to {output_path}...")
    model = GhostFaceNetS(embedding_size=128)
    
    # Load state dict
    ckpt = torch.load(model_path, map_location="cpu", weights_only=True)
    if "model_state_dict" in ckpt:
        model.load_state_dict(ckpt["model_state_dict"])
    else:
        model.load_state_dict(ckpt)
    
    model.eval()
    
    # Adapt 3-channel weights to 1-channel (grayscale)
    old_conv = model.conv_stem[0]
    new_conv = torch.nn.Conv2d(1, 16, kernel_size=old_conv.kernel_size, stride=old_conv.stride, padding=old_conv.padding, bias=False)
    new_conv.weight.data = old_conv.weight.data.mean(dim=1, keepdim=True)
    model.conv_stem[0] = new_conv

    # Create dummy input [Batch, Channels, Height, Width]
    dummy_input = torch.randn(1, 1, 112, 112)
    
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=11,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['embedding'],
        dynamic_axes={'input': {0: 'batch_size'}, 'embedding': {0: 'batch_size'}}
    )
    print("GhostFaceNet export complete.")

def export_liveness(model_path, output_path):
    print(f"Exporting Liveness from {model_path} to {output_path}...")
    model = MiniFASNetV1SE()
    
    ckpt = torch.load(model_path, map_location="cpu", weights_only=True)
    model.load_state_dict(ckpt)
    model.eval()
    
    # Adapt 3-channel weights to 1-channel (grayscale)
    old_conv = model.conv1
    new_conv = torch.nn.Conv2d(1, 32, kernel_size=old_conv.kernel_size, stride=old_conv.stride, padding=old_conv.padding)
    new_conv.weight.data = old_conv.weight.data.mean(dim=1, keepdim=True)
    if old_conv.bias is not None:
        new_conv.bias.data = old_conv.bias.data
    model.conv1 = new_conv

    # Liveness usually takes 80x80
    dummy_input = torch.randn(1, 1, 80, 80)
    
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=11,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['liveness_score'],
        dynamic_axes={'input': {0: 'batch_size'}, 'liveness_score': {0: 'batch_size'}}
    )
    print("Liveness export complete.")

def export_detector(model_path, output_path):
    print(f"Exporting Detector from {model_path} to {output_path}...")
    model = LinzaerDetectorRFB()
    
    ckpt = torch.load(model_path, map_location="cpu", weights_only=True)
    model.load_state_dict(ckpt)
    model.eval()
    
    # Adapt 3-channel weights to 1-channel (grayscale)
    old_conv = model.features[0]
    new_conv = torch.nn.Conv2d(1, 16, kernel_size=old_conv.kernel_size, stride=old_conv.stride, padding=old_conv.padding)
    new_conv.weight.data = old_conv.weight.data.mean(dim=1, keepdim=True)
    if old_conv.bias is not None:
        new_conv.bias.data = old_conv.bias.data
    model.features[0] = new_conv

    # Detector usually takes 240x320
    dummy_input = torch.randn(1, 1, 240, 320)
    
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=11,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['boxes', 'scores'],
        dynamic_axes={'input': {0: 'batch_size'}, 'boxes': {0: 'batch_size'}, 'scores': {0: 'batch_size'}}
    )
    print("Detector export complete.")

if __name__ == "__main__":
    out_dir = os.path.join("edge_vision_engine", "checkpoints", "onnx")
    os.makedirs(out_dir, exist_ok=True)
    
    ghost_in = os.path.join("edge_vision_engine", "checkpoints", "ghostfacenet_epoch_3.pt")
    ghost_out = os.path.join(out_dir, "ghostfacenet.onnx")
    export_ghostfacenet(ghost_in, ghost_out)
    
    live_in = os.path.join("edge_vision_engine", "models", "weights", "mini_fas_net_v1se.pth")
    live_out = os.path.join(out_dir, "liveness.onnx")
    export_liveness(live_in, live_out)
    
    det_in = os.path.join("edge_vision_engine", "models", "weights", "linzaer_version_rfb_320.pth")
    det_out = os.path.join(out_dir, "detector.onnx")
    export_detector(det_in, det_out)
    
    print("\nAll models exported successfully to ONNX format.")
