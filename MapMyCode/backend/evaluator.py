from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.wml_client_error import ApiRequestFailure
import time
import re
import os

def load_watsonx_model(api_key, project_id, model_id=None, url=None):
    # Use environment variables or defaults if not provided
    if model_id is None:
        model_id = os.environ.get("WATSONX_MODEL_ID", "meta-llama/llama-3-2-11b-vision-instruct")
    if url is None:
        url = os.environ.get("WATSONX_ENDPOINT", "https://us-south.ml.cloud.ibm.com")
    credentials = Credentials(url=url, api_key=api_key)
    client = APIClient(credentials)
    # Increase max_new_tokens for longer output
    model = ModelInference(model_id=model_id, api_client=client, project_id=project_id, params={"max_new_tokens": 512})
    return model

def run_prompt(model, prompt, retries=5, delay=10):
    for attempt in range(retries):
        try:
            response = model.generate(prompt)
            return response['results'][0]['generated_text']
        except ApiRequestFailure as e:
            if e.status_code == 429:
                print(f"⚠️ Rate limit hit. Retry {attempt + 1}/{retries} in {delay}s")
                time.sleep(delay)
            else:
                raise
        except Exception as e:
            print(f"Watsonx call failed: {e}")
            raise

def describe_function(model, function_code, retries=3, delay=5):
    """Ask the model to explain in detail what the function does, with clear separation and formatting."""
    prompt = (
        """# Function code:
""" + function_code + """

Explain the following, using clear section headings and bullet points where appropriate:

## Purpose
- What is the purpose of this function?

## Parameters
- List each parameter and its role.

## Return Value
- What does it return?

## Key Logic & Edge Cases
- Describe key logic, handling of edge cases, and anything non-trivial.

Format your answer for readability by a developer (use markdown-style headings and lists).
"""
    )
    for attempt in range(1, retries + 1):
        try:
            response = model.generate(prompt)
            return response['results'][0]['generated_text'].strip()
        except ApiRequestFailure as e:
            if e.status_code == 429 and attempt < retries:
                print(f"⚠️ Rate limit hit. Retrying {attempt}/{retries} in {delay}s...")
                time.sleep(delay)
            else:
                raise
        except Exception as e:
            print(f"❌ Model call failed (describe_function): {e}")
            raise