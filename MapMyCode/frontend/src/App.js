import React, { useState, useEffect } from 'react';
import GraphVisualizer from './GraphVisualizer';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
  const [graphData, setGraphData] = useState({ call_graph: {}, nodes: [], links: [] });
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFunction, setSelectedFunction] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // <-- Add search state
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAIPrompt] = useState("");
  const [aiResult, setAIResult] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [showDebugPrompt, setShowDebugPrompt] = useState(false);
  const [debugPrompt, setDebugPrompt] = useState("");
  const [functionDescription, setFunctionDescription] = useState("");
  const [descLoading, setDescLoading] = useState(false);
  const [openFolders, setOpenFolders] = useState({}); // <-- Add openFolders state

  useEffect(() => {
    fetch('http://127.0.0.1:8000/')
      .then((response) => response.json())
      .catch(() => setErrorMessage("Failed to fetch greeting message. Please try again later."));
  }, []);

  const handleFileUpload = (event) => {
    const files = event.target?.files;
    if (!files || files.length === 0) {
      setErrorMessage("No files selected. Please select files to upload.");
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });

    fetch('http://127.0.0.1:8000/call-graph', {
      method: 'POST',
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.detail) {
          setErrorMessage(data.detail);
          return;
        }

        const nodes = Object.entries(data.call_graph || {}).flatMap(([fileName, fileGraph]) =>
          Object.keys(fileGraph || {}).map((functionName) => ({
            id: `${fileName}:${functionName}`,
            file: fileName,
            function: functionName,
          }))
        );

        const links = Object.entries(data.call_graph || {}).flatMap(([fileName, fileGraph]) =>
          Object.entries(fileGraph || {}).flatMap(([functionName, details]) =>
            (details.calls || []).map((call) => ({
              source: `${fileName}:${functionName}`,
              target: `${fileName}:${call.function}`,
              line: call.line,
            }))
          )
        );

        setGraphData({
          call_graph: data.call_graph || {},
          nodes,
          links,
        });
      })
      .catch(() => setErrorMessage("Error uploading files. Please try again later."));
  };

  const handleFileSelect = (fileName) => {
    setSelectedFile(fileName);
    setSelectedFunction(null); // Reset selected function
  };

  const getFileLanguage = (fileName) => {
    const ext = fileName.split('.').pop();
    if (ext === 'py') return 'python';
    if (ext === 'js' || ext === 'jsx' || ext === 'ts') return 'javascript';
    if (ext === 'sh') return 'shell';
    if (ext === 'java') return 'java';
    return 'other';
  };

  const handleFunctionSelect = (functionData) => {
    setSelectedFunction(functionData);
    setFunctionDescription(""); // Clear previous description when switching functions
  };

  const renderErrorMessage = () => {
    if (!errorMessage) return null;
    return (
      <div className="error-message">
        <p>{errorMessage}</p>
        <button onClick={() => setErrorMessage(null)}>Close</button>
      </div>
    );
  };

  // Helper to build a nested tree from flat file paths (supports unlimited nesting)
  function buildFileTree(callGraph) {
    const root = {};
    for (const filePath of Object.keys(callGraph)) {
      const parts = filePath.split('/');
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!node[part]) {
          if (i === parts.length - 1) {
            node[part] = { __file: filePath };
          } else {
            node[part] = {};
          }
        }
        node = node[part];
      }
    }
    return root;
  }

  // Recursive component to render the tree (supports unlimited nesting)
  function FileTree({ node, parentPath = '', onFileSelect, selectedFile, getFileLanguage, handleFunctionSelect, callGraph, searchQuery, openFolders, setOpenFolders }) {
    return (
      <ul style={{ listStyle: 'none', paddingLeft: 16 }}>
        {Object.entries(node).map(([name, child]) => {
          if (child.__file) {
            // It's a file
            const fileName = child.__file;
            const lang = getFileLanguage(fileName);
            if (lang === 'java') {
              return (
                <li key={fileName} className="file-item">
                  <h3>{fileName} <span style={{color: 'orange'}}>(Java not supported)</span></h3>
                </li>
              );
            }
            if (lang === 'other' || callGraph[fileName].type === 'text' || callGraph[fileName].type === 'unknown') {
              return (
                <li key={fileName} className="file-item">
                  <h3>{fileName} <span style={{color: 'gray'}}>(Unsupported)</span></h3>
                </li>
              );
            }
            // Filter functions by search query
            const filteredFunctions = Object.entries(callGraph[fileName]).filter(([functionName]) =>
              functionName.toLowerCase().includes(searchQuery.toLowerCase())
            );
            return (
              <li key={fileName} className="file-item">
                <h3 onClick={() => onFileSelect(fileName)} style={{ cursor: 'pointer' }}>{fileName} <span style={{color:'#888', fontSize:'0.8em'}}>({lang})</span></h3>
                {selectedFile === fileName && (
                  <ul>
                    {filteredFunctions.map(([functionName, details]) => (
                      <li
                        key={functionName}
                        onClick={() => handleFunctionSelect({ fileName, functionName, details })}
                        style={details.is_fixture ? { color: '#007bff', fontWeight: 'bold' } : {}}
                      >
                        {functionName} {details.is_fixture && <span style={{fontSize:'0.8em', color:'#007bff', marginLeft:4}}>[fixture]</span>} {details.line ? `(Line: ${details.line})` : ''}
                      </li>
                    ))}
                    {filteredFunctions.length === 0 && <li style={{color:'#888'}}>No functions match search.</li>}
                  </ul>
                )}
              </li>
            );
          } else {
            // It's a folder (may contain more folders/files)
            const folderPath = parentPath ? `${parentPath}/${name}` : name;
            const open = !!openFolders[folderPath];
            // Show folder if any child matches search
            const hasMatch = (function checkMatch(n) {
              return Object.entries(n).some(([k, v]) => {
                if (v.__file) {
                  if (k.toLowerCase().includes(searchQuery.toLowerCase())) return true;
                  if (Object.keys(callGraph[v.__file] || {}).some(fn => fn.toLowerCase().includes(searchQuery.toLowerCase()))) return true;
                  return false;
                } else {
                  return checkMatch(v);
                }
              });
            })(child);
            if (!hasMatch) return null;
            return (
              <li key={folderPath}>
                <div style={{ fontWeight: 'bold', cursor: 'pointer', color: '#007bff' }}
                  onClick={() => setOpenFolders(f => ({ ...f, [folderPath]: !f[folderPath] }))}>
                  {open ? '▼' : '▶'} {name}
                </div>
                {open && (
                  <FileTree
                    node={child}
                    parentPath={folderPath}
                    onFileSelect={onFileSelect}
                    selectedFile={selectedFile}
                    getFileLanguage={getFileLanguage}
                    handleFunctionSelect={handleFunctionSelect}
                    callGraph={callGraph}
                    searchQuery={searchQuery}
                    openFolders={openFolders}
                    setOpenFolders={setOpenFolders}
                  />
                )}
              </li>
            );
          }
        })}
      </ul>
    );
  }

  const fileTree = React.useMemo(() => buildFileTree(graphData.call_graph), [graphData.call_graph]);

  const renderFileHierarchy = () => {
    return (
      <FileTree
        node={fileTree}
        onFileSelect={handleFileSelect}
        selectedFile={selectedFile}
        getFileLanguage={getFileLanguage}
        handleFunctionSelect={handleFunctionSelect}
        callGraph={graphData.call_graph}
        searchQuery={searchQuery}
        openFolders={openFolders}
        setOpenFolders={setOpenFolders}
      />
    );
  };

  // AI code generation handler
  const handleAIGenerate = async () => {
    setAILoading(true);
    setAIResult("");
    setDebugPrompt("");
    // Minimal context: root function code and direct callees' code only
    const fileCallGraph = graphData.call_graph[selectedFunction.fileName] || {};
    const all_functions = { ...fileCallGraph };
    const root_code = selectedFunction.details?.source || selectedFunction.details?.code || "";
    // Get direct callees and their code (no recursion, no docstrings)
    const callees = (Array.isArray(selectedFunction.details?.calls) ? selectedFunction.details.calls : [])
      .map(call => {
        const calleeDetails = all_functions[call.function] || {};
        const calleeCode = calleeDetails.source || calleeDetails.code || "";
        return {
          function: call.function,
          code: calleeCode,
          label: 'callee', // explicitly mark as callee/dependent
        };
      });
    const context = {
      fileName: selectedFunction.fileName,
      functionName: selectedFunction.functionName,
      root_code,
      callees // each callee now includes its code and label
    };
    try {
      // Concise prompt instructions to avoid overloading/confusing the model
      const language = getFileLanguage(selectedFunction.fileName);
      const conciseInstructions = `# Generate the function as described below.\n# Only do exactly what the user intends—do not add extra explanations, comments, or code unless explicitly requested.\n# Do NOT generate or rewrite code for any called functions or methods—stick to the core function only.\n# If you have any suggestions or ideas for improvement, add them as a short note at the end, starting with 'Suggestion:'.\n# The code should be valid ${language}.\n# User request:`;
      const enhancedPrompt = `${conciseInstructions}\n${aiPrompt}`;
      const body = { prompt: enhancedPrompt, context };
      if (showDebugPrompt) body.debug = true;
      const response = await fetch("http://127.0.0.1:8000/generate-function", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      setAIResult(data.generated_code || data.error || "No code generated.");
      if (showDebugPrompt && (data.debug_prompt || data.full_prompt || data.prompt || data.context)) {
        setDebugPrompt(data.debug_prompt || data.full_prompt || data.prompt || JSON.stringify(data.context, null, 2));
      }
    } catch (e) {
      setAIResult("Error contacting AI backend.");
    }
    setAILoading(false);
  };

  const fetchFunctionDescription = async () => {
    if (!selectedFunction) return;
    setDescLoading(true);
    setFunctionDescription("");
    try {
      // Enhanced best-practice instructions for describing a function
      const language = getFileLanguage(selectedFunction.fileName);
      const describeInstructions = [
        "- Provide a clear, concise, and accurate description of what the function does.",
        "- Summarize the purpose and main logic of the function in plain language.",
        "- If possible, explain the role of each parameter and the return value.",
        "- Mention any important edge cases, error handling, or side effects.",
        "- If the function is part of a class or module, describe its context or relationship to other code.",
        "- If the user requests a simplified explanation, step-by-step breakdown, or example, provide it as appropriate.",
        "- Do not repeat the function code unless specifically asked.",
        `- The description should be relevant for a ${language} developer.`
      ];
      const describePrompt = [
        "# Please describe the following function, following these guidelines:",
        ...describeInstructions,
        "\n# Function details:",
        JSON.stringify({
          fileName: selectedFunction.fileName,
          functionName: selectedFunction.functionName,
          details: selectedFunction.details
        }, null, 2)
      ].join("\n");
      const response = await fetch("http://127.0.0.1:8000/describe-function", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: describePrompt,
          fileName: selectedFunction.fileName,
          functionName: selectedFunction.functionName,
          details: selectedFunction.details
        }),
      });
      const data = await response.json();
      setFunctionDescription(data.description || data.error || "No description generated.");
    } catch (e) {
      setFunctionDescription("Error contacting AI backend.");
    }
    setDescLoading(false);
  };

  return (
    <div className="App">
      <div className="toolbar">
        <div className="toolbar-left">
          <img
            src="/ibm-logo.png" // Direct path to the image in public folder
            alt="IBM Logo"
            className="ibm-logo"
          />
          <span className="app-title">MapMyCode</span>
        </div>
        <div className="toolbar-right">
          <input
            type="file"
            webkitdirectory="true"
            directory="true"
            multiple
            style={{ display: 'none' }}
            id="file-upload"
            onChange={handleFileUpload}
          />
          <label htmlFor="file-upload" className="upload-button">
            Upload Code
          </label>
          <div className="profile-icon" />
        </div>
      </div>

      {renderErrorMessage()}

      <div className="main-content">
        <div className="file-hierarchy-container">
          {/* Search bar for files/functions */}
          <input
            type="text"
            className="search-bar"
            placeholder="Search files or functions..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '95%', margin: '8px 0', padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
          />
          {renderFileHierarchy()}
        </div>
        <div className="graph-area">
          {selectedFunction && (
            <div className="function-details collapsible">
              <button
                className="toggle-button"
                onClick={() => {
                  const details = document.querySelector('.function-details');
                  details.classList.toggle('collapsed');
                }}
              >
                Toggle Function Details
              </button>
              <div className="details-content">
                <h2>Function Details</h2>
                <p><strong>File:</strong> {selectedFunction.fileName}</p>
                <p><strong>Function:</strong> {selectedFunction.functionName} {selectedFunction.details.is_fixture && <span style={{color:'#007bff', fontWeight:'bold', marginLeft:8}}>[fixture]</span>}</p>
                <p><strong>Line:</strong> {selectedFunction.details.line || 'N/A'}</p>
                {selectedFunction.details.docstring && (
                  <p><strong>Docstring:</strong> {selectedFunction.details.docstring}</p>
                )}
                <h3>Calls:</h3>
                <ul>
                  {/* Aggregate calls by function name */}
                  {(() => {
                    const callMap = {};
                    (Array.isArray(selectedFunction.details?.calls) ? selectedFunction.details.calls : []).forEach(call => {
                      if (!callMap[call.function]) callMap[call.function] = { count: 0, lines: [] };
                      callMap[call.function].count++;
                      callMap[call.function].lines.push(call.line);
                    });
                    const callEntries = Object.entries(callMap);
                    if (callEntries.length === 0) return <li style={{color: '#888'}}>No call data available</li>;
                    return callEntries.map(([fn, info], idx) => (
                      <li key={fn}>
                        {fn} — <strong>{info.count} time{info.count > 1 ? 's' : ''}</strong>
                        {info.lines.length > 0 && (
                          <span style={{color:'#888', marginLeft:6}}>
                            (Line{info.lines.length > 1 ? 's' : ''}: {info.lines.filter(l => l !== undefined).join(', ')})
                          </span>
                        )}
                      </li>
                    ));
                  })()}
                </ul>
                {(() => {
                  // Aggregate called_by by function name
                  const calledByMap = {};
                  (Array.isArray(selectedFunction.details?.called_by) ? selectedFunction.details.called_by : []).forEach(caller => {
                    if (!calledByMap[caller.function]) calledByMap[caller.function] = { count: 0, lines: [] };
                    calledByMap[caller.function].count++;
                    calledByMap[caller.function].lines.push(caller.line);
                  });
                  const calledByEntries = Object.entries(calledByMap);
                  if (calledByEntries.length === 0) return null;
                  return (
                    <>
                      <h3>Called By:</h3>
                      <ul>
                        {calledByEntries.map(([fn, info], idx) => (
                          <li key={fn}>
                            {fn} — <strong>{info.count} time{info.count > 1 ? 's' : ''}</strong>
                            {info.lines.length > 0 && (
                              <span style={{color:'#888', marginLeft:6}}>
                                (Line{info.lines.length > 1 ? 's' : ''}: {info.lines.filter(l => l !== undefined).join(', ')})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  );
                })()}
                <button
                  style={{ margin: '12px 0', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer' }}
                  onClick={() => setShowAIModal(true)}
                >
                  Generate with AI
                </button>
                <button
                  style={{ margin: '12px 0', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer' }}
                  onClick={fetchFunctionDescription}
                  disabled={descLoading}
                >
                  {descLoading ? 'Generating Description...' : 'Describe Function'}
                </button>
                {functionDescription && (
                  <div className="function-description" style={{ marginTop: 12, background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                    <h4 style={{ fontWeight: 'bold' }}>Function Description</h4>
                    <ReactMarkdown>{functionDescription}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Graph Visualizer */}
          {selectedFunction && (() => {
            // Aggregate nodes: unique by function name (within the selected file)
            const nodeSet = new Map();
            const addNode = (fn, line) => {
              if (!nodeSet.has(fn)) nodeSet.set(fn, { id: fn, function: fn, line, file: selectedFunction.fileName });
            };
            addNode(selectedFunction.functionName, selectedFunction.details.line);
            (Array.isArray(selectedFunction.details?.calls) ? selectedFunction.details.calls : []).forEach(call => addNode(call.function, call.line));
            (Array.isArray(selectedFunction.details?.called_by) ? selectedFunction.details.called_by : []).forEach(caller => addNode(caller.function, caller.line));

            // Aggregate links: group by target/source, count occurrences, collect lines
            const callCounts = {};
            (Array.isArray(selectedFunction.details?.calls) ? selectedFunction.details.calls : []).forEach(call => {
              const key = `${selectedFunction.functionName}->${call.function}`;
              if (!callCounts[key]) callCounts[key] = { source: selectedFunction.functionName, target: call.function, lines: [] };
              callCounts[key].lines.push(call.line);
            });
            const calledByCounts = {};
            (Array.isArray(selectedFunction.details?.called_by) ? selectedFunction.details.called_by : []).forEach(caller => {
              const key = `${caller.function}->${selectedFunction.functionName}`;
              if (!calledByCounts[key]) calledByCounts[key] = { source: caller.function, target: selectedFunction.functionName, lines: [] };
              calledByCounts[key].lines.push(caller.line);
            });

            return (
              <GraphVisualizer
                data={{
                  nodes: Array.from(nodeSet.values()),
                  links: [
                    ...Object.values(callCounts).map(l => ({ ...l, count: l.lines.length })),
                    ...Object.values(calledByCounts).map(l => ({ ...l, count: l.lines.length })),
                  ],
                }}
              />
            );
          })()}
        </div>
      </div>

      {/* AI Modal */}
      {showAIModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 600, maxWidth: '95vw', width: '80vw', boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
            <h2>AI-Assisted Function Generation</h2>
            <label style={{ fontWeight: 'bold' }}>Describe the function you want to generate:</label>
            <textarea
              value={aiPrompt}
              onChange={e => setAIPrompt(e.target.value)}
              rows={8}
              style={{ width: '100%', minHeight: 120, margin: '12px 0', padding: 8, borderRadius: 4, border: '1px solid #ccc', resize: 'vertical' }}
              placeholder="e.g. Write a function that validates an email address."
            />
            <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={handleAIGenerate}
                disabled={aiLoading || !aiPrompt.trim()}
                style={{ background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 'bold', marginRight: 12 }}
              >
                {aiLoading ? 'Generating...' : 'Generate'}
              </button>
              <button onClick={() => { setShowAIModal(false); setAIResult(""); setAIPrompt(""); setShowDebugPrompt(false); setDebugPrompt(""); }} style={{ border: 'none', background: '#eee', borderRadius: 4, padding: '8px 16px', marginRight: 12 }}>Cancel</button>
              <label style={{ marginLeft: 8, fontSize: '0.95em', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showDebugPrompt}
                  onChange={e => setShowDebugPrompt(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                Show AI Prompt/Context (Debug)
              </label>
            </div>
            {aiResult && (
              <div style={{ marginTop: 16 }}>
                <label style={{ fontWeight: 'bold' }}>Generated Code:</label>
                <div style={{
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 4,
                  minHeight: 200,
                  maxHeight: '60vh',
                  width: '100%',
                  overflowY: 'auto', // always show vertical scroll if needed
                  fontSize: '1em',
                  boxSizing: 'border-box',
                }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{aiResult}</pre>
                </div>
              </div>
            )}
            {showDebugPrompt && debugPrompt && (
              <div style={{ marginTop: 24 }}>
                <details open style={{ background: '#f0f0f0', borderRadius: 4, padding: 12 }}>
                  <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Full AI Prompt/Context Sent to Backend</summary>
                  <pre style={{ margin: 0, fontSize: '0.95em', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflow: 'auto' }}>{debugPrompt}</pre>
                </details>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
