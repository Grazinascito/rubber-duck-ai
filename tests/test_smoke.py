def test_imports_the_pinned_backend_dependencies_successfully():
    import fastapi
    import uvicorn
    import dotenv

    assert fastapi.FastAPI is not None
    assert uvicorn.run is not None
    assert dotenv.load_dotenv is not None
