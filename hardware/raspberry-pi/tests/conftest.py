"""
conftest.py — pytest configuration for the Raspberry Pi agent tests.

Adds the parent directory (hardware/raspberry-pi/) to sys.path so that
each module (threshold_service, gpio_controller, …) can be imported
without any package install step.

Also provides shared fixtures and stubs used across test files.
"""
import sys
import os

# Make the Pi module directory importable from every test file
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
