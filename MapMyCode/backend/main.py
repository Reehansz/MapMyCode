import os
import ast
import logging
from typing import List, Dict
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
import yaml

# Configure logging
logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Allow requests from the frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}

def parse_python_file(file_content: str) -> List[Dict]:
    """Parse a Python file and extract function definitions."""
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
    """Generate a call graph with line numbers from a Python file."""
    tree = ast.parse(file_content)
    call_graph = {}

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            function_name = node.name
            call_graph[function_name] = {
                "calls": [],
                "called_by": [],
                "line": node.lineno,
            }

            for child in ast.walk(node):
                if isinstance(child, ast.Call):
                    if isinstance(child.func, ast.Name):
                        call_graph[function_name]["calls"].append({
                            "function": child.func.id,
                            "line": child.lineno,
                        })
                    elif isinstance(child.func, ast.Attribute):
                        # Safely resolve module-level calls
                        if isinstance(child.func.value, ast.Name):
                            call_graph[function_name]["calls"].append({
                                "function": f"{child.func.value.id}.{child.func.attr}",
                                "line": child.lineno,
                            })

    # Build reverse call graph (called_by relationships)
    for caller, details in call_graph.items():
        for call in details["calls"]:
            callee = call["function"]
            if callee in call_graph:
                call_graph[callee]["called_by"].append({
                    "function": caller,
                    "line": call["line"],
                })

    return call_graph

def generate_js_ts_call_graph(file_content: str) -> Dict:
    """Generate a call graph for JavaScript/TypeScript files."""
    import re

    call_graph = {}
    function_pattern = re.compile(r'function\s+(\w+)\s*\(')
    call_pattern = re.compile(r'(\w+)\s*\(')

    lines = file_content.splitlines()
    for i, line in enumerate(lines):
        function_match = function_pattern.search(line)
        if function_match:
            function_name = function_match.group(1)
            call_graph[function_name] = {
                "calls": [],
                "line": i + 1,
            }

        call_match = call_pattern.findall(line)
        if call_match:
            for called_function in call_match:
                if called_function in call_graph:
                    call_graph[called_function]["calls"].append({
                        "function": called_function,
                        "line": i + 1,
                    })

    return call_graph

def process_shell_script(file_content: str) -> Dict:
    """Process shell script files and extract basic information."""
    import re

    call_graph = {}
    function_pattern = re.compile(r'^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\)\s*\{')
    call_pattern = re.compile(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\b')

    lines = file_content.splitlines()
    for i, line in enumerate(lines):
        function_match = function_pattern.match(line)
        if function_match:
            function_name = function_match.group(1)
            call_graph[function_name] = {
                "calls": [],
                "line": i + 1,
            }

        call_match = call_pattern.findall(line)
        if call_match:
            for called_function in call_match:
                if called_function in call_graph:
                    call_graph[called_function]["calls"].append({
                        "function": called_function,
                        "line": i + 1,
                    })

    return call_graph

def process_non_python_file(file_content: str, file_extension: str) -> Dict:
    """Process non-Python files and extract basic information."""
    if file_extension == ".sh":
        return process_shell_script(file_content)

    if file_extension in [".txt", ".md", "Dockerfile"]:
        # Include in file directory but do not process for call graphs
        lines = file_content.splitlines()
        return {"type": "text", "lines": lines[:10]}  # Limit to first 10 lines

    if file_extension in [".js", ".ts"]:
        return generate_js_ts_call_graph(file_content)

    if file_extension in [".json"]:
        try:
            import json
            parsed_content = json.loads(file_content)
            return {"type": "json", "content": parsed_content}
        except json.JSONDecodeError:
            return {"type": "json", "error": "Invalid JSON"}

    if file_extension in [".yaml", ".yml"]:
        try:
            parsed_content = yaml.safe_load(file_content)
            return {"type": "yaml", "content": parsed_content}
        except yaml.YAMLError:
            return {"type": "yaml", "error": "Invalid YAML"}

    # Fallback for unsupported file types
    return {"type": "unknown", "content": file_content[:100]}  # Limit to first 100 chars

@app.post("/parse")
def parse_file(file: UploadFile = File(...)):
    """Endpoint to parse an uploaded Python file."""
    content = file.file.read().decode("utf-8")
    functions = parse_python_file(content)
    return {"functions": functions}

MAX_FILES = 1000

@app.post("/call-graph")
def call_graph(files: List[UploadFile] = File(...)):
    """Endpoint to generate a call graph grouped by file."""
    try:
        logging.info("Received files: %s", [file.filename for file in files])
        grouped_graph = {}

        for file in files:
            file_extension = os.path.splitext(file.filename)[1]

            try:
                content = file.file.read().decode("utf-8")
                logging.info("Processing file: %s", file.filename)

                if file_extension == ".py":
                    graph = generate_call_graph_with_lines(content)
                    grouped_graph[file.filename] = graph
                else:
                    non_python_data = process_non_python_file(content, file_extension)
                    grouped_graph[file.filename] = non_python_data

            except Exception as e:
                logging.error("Error processing file %s: %s", file.filename, str(e))
                continue

        return {"call_graph": grouped_graph}
    except Exception as e:
        logging.error("Error processing files: %s", str(e))
        return {"error": "Internal Server Error"}, 500