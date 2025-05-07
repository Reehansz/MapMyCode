# 📄 Project Requirements Document (PRD) – MapMyCode

## 🧠 Project Summary
**MapMyCode** is an AI-assisted developer tool designed to visualize the relationships between functions in a codebase, help understand functional dependencies, and generate new code using contextual intelligence. The tool enables users to view function hierarchies, create new files/functions visually, and save them back into the project — all with minimal effort and maximum clarity.

---

## 📋 All Requirements (Flat List)

| Requirement ID | Description | User Story | Expected Behavior/Outcome |
|----------------|-------------|------------|----------------------------|
| REQ-001 | Parse Python files to extract function definitions | As a developer, I want to scan a project folder to find all functions | The tool reads files recursively and identifies all function definitions with file name, line numbers, and docstrings |
| REQ-002 | Identify function calls within other functions | As a developer, I want to see which functions call which others | Each function node will list all called functions by reference |
| REQ-003 | Build internal call graph structure | As a system, I need to organize parsed functions into a graph model | Call relationships are stored as a JSON graph of `caller → callee` mappings |
| REQ-004 | Visualize function relationships as an interactive graph | As a user, I want to see how functions relate visually | Users see a graph with nodes (functions) and arrows (calls); grouped by file/module |
| REQ-005 | Click to explore function call hierarchy | As a user, I want to click a function to see who it calls and who calls it | On selecting a node, the UI highlights its immediate callers and callees |
| REQ-006 | Display function metadata | As a user, I want to see filename, line number, and signature when I hover over a node | Tooltip or side panel displays metadata when hovering/clicking a node |
| REQ-007 | Enable zoom, pan, and collapse on graph | As a user, I want to navigate large graphs with ease | Users can zoom, drag, and collapse grouped nodes (like by module) |
| REQ-008 | Allow user to visually create new function node | As a user, I want to add a new function via the diagram | A new node appears, unlinked until connected manually |
| REQ-009 | Enable drawing arrows to define dependencies | As a user, I want to indicate what functions my new function will use | User draws arrows from the new node to existing nodes |
| REQ-010 | Collect context from linked functions | As an AI module, I need full source of all linked functions to generate relevant code | Source code of linked nodes is included in the AI prompt |
| REQ-011 | Generate code with AI using user input and context | As a user, I want AI to generate a new function based on context + my description | AI generates a valid Python function using provided prompt and linked code context |
| REQ-012 | Allow user to edit and finalize AI-generated function | As a user, I want to review or tweak the generated code | Editable code preview panel is shown before saving |
| REQ-013 | Choose location to save function | As a user, I want to pick where this new function goes | A file selector or auto-suggest path allows choosing target file |
| REQ-014 | Save function into new or existing Python file | As a user, I want my generated function saved back into my codebase | Writes function into chosen file with proper indentation and formatting |
| REQ-015 | Show diff/preview before applying changes | As a user, I want to confirm code changes before they’re saved | Modal or pane shows before/after comparison and confirms action |
| REQ-016 | Batch save multiple edits | As a user, I want to apply all generated/modified functions at once | "Apply All" saves changes to multiple files in one batch |
| REQ-017 | Search and filter functions | As a user, I want to search by function or file name | Filters or search bar dynamically updates visible nodes |
| REQ-018 | Group graph by file/module | As a user, I want to organize the graph by file/folder | Functions from the same file are grouped visually or collapsible |
| REQ-019 | Import zipped codebase or sync folder | As a user, I want to upload my project easily | UI allows uploading zip or choosing local path via backend sync |
| REQ-020 | Show error handling for missing/invalid functions | As a user, I want to know when parsing or generation fails | Errors shown clearly in UI with helpful messages |
| REQ-021 | Maintain a session or change history | As a user, I want to undo/redo recent changes | Local session history allows reverts, ideally before saving |
| REQ-022 | Git integration for commits | As a user, I want to commit changes directly from the tool | After saving, the tool stages and commits changes with a message |
| REQ-023 | Language support beyond Python | As a user, I want to use this with JS/TS or Java projects | The parser supports multiple languages using language-specific libraries |
| REQ-024 | Simulate function execution paths | As a user, I want to test what will be called if I run a function | A call simulation tool traces runtime calls given sample inputs |
| REQ-025 | Test coverage overlay | As a user, I want to see which parts of the graph are covered by tests | Overlay visually distinguishes covered and uncovered functions |

---

## ✅ Summary of Prioritization
| Phase | Focus | Priority |
|-------|-------|----------|
| Phase 1 | Parsing and Graph Generation | 🔥 Highest |
| Phase 2 | Visualization UI | 🔥 Highest |
| Phase 3 | Contextual AI & Code Generation | 🔥 High |
| Phase 4 | Save to Codebase | 🔥 High |
| Phase 5 | UX Improvements & Polish | ✅ Medium |
| Future | Stretch Capabilities | 💡 Optional |