import sys
try:
    import fastapi
    import uvicorn
    import websockets
    print("CORE_PACKAGES_INSTALLED")
except ImportError as e:
    print(f"MISSING_PACKAGE: {e.name}")

try:
    import mlx.core as mx
    print("MLX_INSTALLED")
except ImportError:
    print("MLX_NOT_INSTALLED")
