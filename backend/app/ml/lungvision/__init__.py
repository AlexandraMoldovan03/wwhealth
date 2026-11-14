"""
LungVision — experimental pneumonia screening on chest X-rays (educational prototype).

Model: DenseNet121 + Linear(1024, 1), trained on PneumoniaMNIST (224x224) in
ai/notebooks/LungVision_Training.ipynb. Positive class (1) = pneumonia. Threshold 0.3 on sigmoid.

    model.py         build + load the checkpoint (backend/models/lungvision_best.pth)
    predict_xray.py  validate/decode the upload, preprocess exactly like the notebook, score
    gradcam.py       Grad-CAM on model.features.norm5 + overlay PNG
    errors.py        exceptions (importable without torch)

torch is imported lazily by app/services/lung_service.py, so the API still starts without it.
"""
