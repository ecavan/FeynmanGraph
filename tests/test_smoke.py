import feyngraph


def test_version_is_string():
    assert isinstance(feyngraph.__version__, str)
    assert feyngraph.__version__.startswith("0.1")
