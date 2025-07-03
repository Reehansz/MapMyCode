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
  const [draggedCardPos, setDraggedCardPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAIPrompt] = useState("");
  const [aiResult, setAIResult] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [generatedDescription, setGeneratedDescription] = useState(""); // New state for generated description
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

  // Drag handlers for function card
  const handleDragStart = (e) => {
    setIsDragging(true);
    // Get initial mouse position relative to card
    const rect = e.target.getBoundingClientRect();
    setDraggedCardPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleDrag = (e) => {
    if (!isDragging || !selectedFunction) return;
    if (e.clientX === 0 && e.clientY === 0) return; // Ignore dragend event
    const container = document.querySelector('.function-cards-container');
    if (!container) return;
    // Set the card's position relative to the container
    const containerRect = container.getBoundingClientRect();
    const newX = e.clientX - containerRect.left - draggedCardPos.x;
    const newY = e.clientY - containerRect.top - draggedCardPos.y;
    const card = document.getElementById('draggable-function-card');
    if (card) {
      card.style.position = 'absolute';
      card.style.left = `${newX}px`;
      card.style.top = `${newY}px`;
      card.style.zIndex = 10;
      card.style.cursor = 'grabbing';
    }
  };

  const handleDragEnd = (e) => {
    setIsDragging(false);
    const card = document.getElementById('draggable-function-card');
    if (card) {
      card.style.cursor = 'grab';
    }
  };

  // AI code generation handler
  const handleAIGenerate = async () => {
    setAILoading(true);
    setAIResult("");
    setGeneratedDescription(""); // Reset description state
    // Collect context: function code, callees, callers, docstring
    const context = {
      fileName: selectedFunction.fileName,
      functionName: selectedFunction.functionName,
      details: selectedFunction.details,
      callees: (Array.isArray(selectedFunction.details?.calls) ? selectedFunction.details.calls : []),
      callers: (Array.isArray(selectedFunction.details?.called_by) ? selectedFunction.details.called_by : []),
    };
    try {
      const response = await fetch("http://127.0.0.1:8000/generate-function", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, context }),
      });
      const data = await response.json();
      setAIResult(data.generated_code || data.error || "No code generated.");
      setGeneratedDescription(data.description || ""); // Fix: use 'description' field from backend
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
      const response = await fetch("http://127.0.0.1:8000/describe-function", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 400, maxWidth: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
            <h2>AI-Assisted Function Generation</h2>
            <label style={{ fontWeight: 'bold' }}>Describe the function you want to generate:</label>
            <textarea
              value={aiPrompt}
              onChange={e => setAIPrompt(e.target.value)}
              rows={8} // Increased from 4 to 8 for more space
              style={{ width: '100%', minHeight: 120, margin: '12px 0', padding: 8, borderRadius: 4, border: '1px solid #ccc', resize: 'vertical' }}
              placeholder="e.g. Write a function that validates an email address."
            />
            <div style={{ margin: '12px 0' }}>
              <button
                onClick={handleAIGenerate}
                disabled={aiLoading || !aiPrompt.trim()}
                style={{ background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 'bold', marginRight: 12 }}
              >
                {aiLoading ? 'Generating...' : 'Generate'}
              </button>
              <button onClick={() => { setShowAIModal(false); setAIResult(""); setAIPrompt(""); }} style={{ border: 'none', background: '#eee', borderRadius: 4, padding: '8px 16px' }}>Cancel</button>
            </div>
            {aiResult && (
              <div style={{ marginTop: 16 }}>
                <label style={{ fontWeight: 'bold' }}>Generated Code:</label>
                <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>{aiResult}</pre>
                {generatedDescription && (
                  <div className="generated-description" style={{ marginTop: 12 }}>
                    <h4 style={{ fontWeight: 'bold' }}>Function Description</h4>
                    <p style={{ margin: 0 }}>{generatedDescription}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
