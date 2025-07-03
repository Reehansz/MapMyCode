import os
import ast
import logging
import json
import yaml
import requests
import re
from typing import List, Dict
from fastapi import FastAPI, UploadFile, File, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.wml_client_error import ApiRequestFailure
from evaluator import load_watsonx_model, run_prompt, describe_function
import inspect

# Configure logging
logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}

def parse_python_file(file_content: str) -> List[Dict]:
    tree = ast.parse(file_content)
    functions = []
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            functions.append({
                "name": node.name,
                "lineno": node.lineno,
                "docstring": ast.get_docstring(node)
            })
    return functions

def generate_call_graph_with_lines(file_content: str) -> Dict:
    call_graph = {}
    fixture_names = set()
    class FixtureVisitor(ast.NodeVisitor):
        def visit_FunctionDef(self, node):
            is_fixture = any(
                (isinstance(dec, ast.Name) and dec.id == 'fixture') or
                (isinstance(dec, ast.Attribute) and dec.attr == 'fixture')
                for dec in node.decorator_list
            )
            if is_fixture:
                fixture_names.add(node.name)
            call_graph[node.name] = {
                "calls": [],
                "called_by": [],
                "line": node.lineno,
                "docstring": ast.get_docstring(node),
                "is_fixture": is_fixture,
                "params": [arg.arg for arg in node.args.args],
            }

    tree = ast.parse(file_content)
    FixtureVisitor().visit(tree)

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            function_name = node.name
            for child in ast.walk(node):
                if isinstance(child, ast.Call):
                    if isinstance(child.func, ast.Name):
                        call_graph[function_name]["calls"].append({
                            "function": child.func.id,
                            "line": child.lineno,
                        })
                    elif isinstance(child.func, ast.Attribute):
                        if isinstance(child.func.value, ast.Name):
                            call_graph[function_name]["calls"].append({
                                "function": f"{child.func.value.id}.{child.func.attr}",
                                "line": child.lineno,
                            })

    for func, details in call_graph.items():
        for param in details.get("params", []):
            if param in fixture_names and param != func:
                details["calls"].append({
                    "function": param,
                    "line": details["line"],
                    "fixture_param": True
                })

    for caller, details in call_graph.items():
        for call in details["calls"]:
            callee = call["function"]
            if callee in call_graph:
                call_graph[callee]["called_by"].append({
                    "function": caller,
                    "line": call.get("line")
                })

    return call_graph

def generate_js_ts_call_graph(file_content: str) -> Dict:
    call_graph = {}
    function_pattern = re.compile(r'function\s+(\w+)\s*\(')
    arrow_pattern = re.compile(r'(?:const|let|var)\s+(\w+)\s*=\s*\(?[^)]*\)?\s*=>')
    class_method_pattern = re.compile(r'^(\s*)(\w+)\s*\(.*?\)\s*\{')
    call_pattern = re.compile(r'(\w+)\s*\(')

    lines = file_content.splitlines()
    in_class = False
    class_indent = None

    for i, line in enumerate(lines):
        function_match = function_pattern.search(line)
        if function_match:
            call_graph[function_match.group(1)] = {"calls": [], "line": i + 1}
            continue

        arrow_match = arrow_pattern.search(line)
        if arrow_match:
            call_graph[arrow_match.group(1)] = {"calls": [], "line": i + 1}
            continue

        if 'class ' in line:
            in_class = True
            class_indent = len(line) - len(line.lstrip())
            continue

        if in_class:
            method_match = class_method_pattern.match(line)
            if method_match:
                indent = len(method_match.group(1))
                if indent > class_indent:
                    call_graph[method_match.group(2)] = {"calls": [], "line": i + 1}
                    continue
            if line.strip() == '}' or (len(line) - len(line.lstrip()) <= class_indent and line.strip()):
                in_class = False
                class_indent = None

        call_match = call_pattern.findall(line)
        if call_match:
            for called_function in call_match:
                if called_function in call_graph:
                    call_graph[called_function]["calls"].append({"function": called_function, "line": i + 1})

    return call_graph

def process_shell_script(file_content: str) -> Dict:
    call_graph = {}
    function_pattern = re.compile(r'^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\)\s*\{')
    call_pattern = re.compile(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\b')
    lines = file_content.splitlines()
    current_function = None

    for i, line in enumerate(lines):
        function_match = function_pattern.match(line)
        if function_match:
            current_function = function_match.group(1)
            call_graph[current_function] = {"calls": [], "called_by": [], "line": i + 1}
            continue

        if current_function:
            call_match = call_pattern.findall(line)
            for called_function in call_match:
                if called_function in call_graph and called_function != current_function:
                    call_graph[current_function]["calls"].append({"function": called_function, "line": i + 1})

    for caller, details in call_graph.items():
        for call in details["calls"]:
            callee = call["function"]
            if callee in call_graph:
                call_graph[callee]["called_by"].append({"function": caller, "line": call["line"]})

    return call_graph

def process_java_file(file_content: str) -> Dict:
    call_graph = {}
    method_pattern = re.compile(r'(public|private|protected)?\s*(static)?\s*[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)\s*\{')
    call_pattern = re.compile(r'(\w+)\s*\(')
    lines = file_content.splitlines()
    current_method = None

    for i, line in enumerate(lines):
        method_match = method_pattern.search(line)
        if method_match:
            current_method = method_match.group(3)
            call_graph[current_method] = {"calls": [], "called_by": [], "line": i + 1}
            continue

        if current_method:
            call_match = call_pattern.findall(line)
            for called_method in call_match:
                if called_method in call_graph and called_method != current_method:
                    call_graph[current_method]["calls"].append({"function": called_method, "line": i + 1})

    for caller, details in call_graph.items():
        for call in details["calls"]:
            callee = call["function"]
            if callee in call_graph:
                call_graph[callee]["called_by"].append({"function": caller, "line": call["line"]})

    return call_graph

def process_non_python_file(file_content: str, file_extension: str) -> Dict:
    if file_extension == ".sh":
        return process_shell_script(file_content)
    if file_extension == ".java":
        return process_java_file(file_content)
    if file_extension in [".txt", ".md", "Dockerfile"]:
        return {"type": "text", "lines": file_content.splitlines()[:10]}
    if file_extension in [".js", ".ts"]:
        return generate_js_ts_call_graph(file_content)
    if file_extension in [".json"]:
        try:
            return {"type": "json", "content": json.loads(file_content)}
        except json.JSONDecodeError:
            return {"type": "json", "error": "Invalid JSON"}
    if file_extension in [".yaml", ".yml"]:
        try:
            return {"type": "yaml", "content": yaml.safe_load(file_content)}
        except yaml.YAMLError:
            return {"type": "yaml", "error": "Invalid YAML"}
    return {"type": "unknown", "content": file_content[:100]}

@app.post("/parse")
def parse_file(file: UploadFile = File(...)):
    content = file.file.read().decode("utf-8")
    functions = parse_python_file(content)
    return {"functions": functions}

MAX_FILES = 1000

@app.post("/call-graph")
def call_graph(files: List[UploadFile] = File(...)):
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=413, detail=f"Too many files. Max allowed is {MAX_FILES}.")

    grouped_graph = {}
    text_extensions = {".py", ".js", ".ts", ".sh", ".java", ".txt", ".md", "Dockerfile", ".json", ".yaml", ".yml"}
    for file in files:
        file_extension = os.path.splitext(file.filename)[1]
        if file_extension not in text_extensions:
            logging.warning(f"Skipping non-text or unsupported file: {file.filename}")
            continue
        try:
            content = file.file.read().decode("utf-8")
            if file_extension == ".py":
                graph = generate_call_graph_with_lines(content)
                grouped_graph[file.filename] = graph
            else:
                grouped_graph[file.filename] = process_non_python_file(content, file_extension)
        except UnicodeDecodeError:
            logging.warning(f"Skipping binary or non-UTF-8 file: {file.filename}")
            continue
        except Exception as e:
            logging.error("Error processing file %s: %s", file.filename, str(e))
            continue
    return {"call_graph": grouped_graph}

class FunctionGenInput(BaseModel):
    prompt: str
    context: Dict

@app.post("/generate-function")
async def generate_function(data: FunctionGenInput):
    watsonx_api_key = os.environ.get("WATSONX_API_KEY")
    watsonx_project_id = os.environ.get("WATSONX_PROJECT_ID")
    watsonx_url = os.environ.get("WATSONX_ENDPOINT", "https://us-south.ml.cloud.ibm.com")
    watsonx_model_id = os.environ.get("WATSONX_MODEL_ID", "meta-llama/llama-3-2-11b-vision-instruct")

    if not (watsonx_api_key and watsonx_project_id):
        raise HTTPException(status_code=400, detail="Missing Watsonx credentials. Set WATSONX_API_KEY and WATSONX_PROJECT_ID.")

    context = data.context
    prompt = data.prompt
    context_str = []
    context_str.append("# Context for code generation")
    context_str.append(f"File: {context.get('fileName')}")
    context_str.append(f"Function: {context.get('functionName')}")
    if context.get('details', {}).get('docstring'):
        context_str.append(f"Docstring: {context['details']['docstring']}")
    if context.get('details', {}).get('params'):
        context_str.append(f"Parameters: {context['details']['params']}")
    if context.get('callees'):
        context_str.append(f"Direct callees: {[c['function'] for c in context['callees']]}")
    if context.get('callers'):
        context_str.append(f"Direct callers: {[c['function'] for c in context['callers']]}")
    context_str.append("")
    context_str.append("# User request:")
    context_str.append(prompt)
    context_str.append("")
    context_str.append("# Generate the function code:")

    try:
        model = load_watsonx_model(watsonx_api_key, watsonx_project_id)
        function_code = run_prompt(model, "\n".join(context_str))
        if not function_code:
            raise HTTPException(status_code=500, detail="No code generated by Watsonx.")
        # Generate a description for the function
        description = describe_function(model, function_code)
        return {"generated_code": function_code, "description": description}
    except ApiRequestFailure as e:
        logging.error("Watsonx SDK call failed: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Watsonx SDK error: {str(e)}")
    except Exception as e:
        logging.error("Watsonx call failed: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))

class DescribeFunctionInput(BaseModel):
    fileName: str
    functionName: str
    details: dict

@app.post("/describe-function")
async def describe_function_endpoint(data: DescribeFunctionInput):
    watsonx_api_key = os.environ.get("WATSONX_API_KEY")
    watsonx_project_id = os.environ.get("WATSONX_PROJECT_ID")
    if not (watsonx_api_key and watsonx_project_id):
        return {"error": "Missing Watsonx credentials."}
    code = data.details.get("source")
    # Try to extract function source from file if not present
    if not code and data.fileName and data.functionName and data.details.get("line"):
        try:
            # Try absolute path first, then relative to backend dir
            file_paths = [data.fileName]
            if not os.path.isabs(data.fileName):
                file_paths.append(os.path.join(os.getcwd(), data.fileName))
            found = False
            for path in file_paths:
                if os.path.exists(path):
                    with open(path, "r") as f:
                        lines = f.readlines()
                    start = data.details["line"] - 1
                    # Try to find the function end (next def/class or end of file)
                    end = start + 1
                    while end < len(lines):
                        if lines[end].lstrip().startswith("def ") or lines[end].lstrip().startswith("class "):
                            break
                        end += 1
                    code = "".join(lines[start:end])
                    found = True
                    break
            if not found:
                code = None
        except Exception as e:
            code = None
    if not code:
        code = data.details.get("docstring") or ""
    if not code:
        return {"description": "No function code available to describe."}
    model = load_watsonx_model(watsonx_api_key, watsonx_project_id)
    try:
        description = describe_function(model, code)
        return {"description": description}
    except Exception as e:
        return {"error": str(e)}
