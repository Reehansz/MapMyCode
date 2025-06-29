import React, { useState, useEffect } from 'react';
import FileCard from './FileCard';
import GraphVisualizer from './GraphVisualizer';
import './App.css';

function App() {
  const [graphData, setGraphData] = useState({ call_graph: {}, nodes: [], links: [] });
  const [greetMessage, setGreetMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFunction, setSelectedFunction] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/')
      .then((response) => response.json())
      .then((data) => setGreetMessage(data.message))
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

  const handleFunctionSelect = (functionData) => {
    setSelectedFunction(functionData);
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

  const renderFileHierarchy = () => {
    return Object.entries(graphData.call_graph || {}).map(([fileName, fileGraph]) => (
      <div key={fileName} className="file-item">
        <h3 onClick={() => handleFileSelect(fileName)}>{fileName}</h3>
        {selectedFile === fileName && (
          <ul>
            {Object.entries(fileGraph).map(([functionName, details]) => (
              <li key={functionName} onClick={() => handleFunctionSelect({ fileName, functionName, details })}>
                {functionName} (Line: {details.line})
              </li>
            ))}
          </ul>
        )}
      </div>
    ));
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
                <p><strong>Function:</strong> {selectedFunction.functionName}</p>
                <p><strong>Line:</strong> {selectedFunction.details.line}</p>
                <p><strong>Docstring:</strong> {selectedFunction.details.docstring || 'No docstring available'}</p>
                <h3>Calls:</h3>
                <ul>
                  {selectedFunction.details.calls.map((call, index) => (
                    <li key={index}>{call.function} (Line: {call.line})</li>
                  ))}
                </ul>
                <h3>Called By:</h3>
                <ul>
                  {selectedFunction.details.called_by.map((caller, index) => (
                    <li key={index}>{caller.function} (Line: {caller.line})</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Function Cards Container */}
          <div className="function-cards-container">
            {selectedFile &&
              Object.entries(graphData.call_graph[selectedFile] || {}).map(([functionName, details]) => (
                <div
                  key={functionName}
                  className="function-card"
                  onClick={() => handleFunctionSelect({ fileName: selectedFile, functionName, details })}
                >
                  {functionName} (Line: {details.line})
                </div>
              ))}
          </div>

          {/* Graph Visualizer */}
          {selectedFunction && (
            <GraphVisualizer
              data={{
                nodes: [
                  { id: selectedFunction.functionName, function: selectedFunction.functionName, line: selectedFunction.details.line, file: selectedFunction.fileName },
                  ...selectedFunction.details.calls.map((call) => ({ id: call.function, function: call.function, line: call.line, file: selectedFunction.fileName })),
                  ...selectedFunction.details.called_by.map((caller) => ({ id: caller.function, function: caller.function, line: caller.line, file: selectedFunction.fileName })),
                ],
                links: [
                  ...selectedFunction.details.calls.map((call) => ({ source: selectedFunction.functionName, target: call.function, line: call.line })),
                  ...selectedFunction.details.called_by.map((caller) => ({ source: caller.function, target: selectedFunction.functionName, line: caller.line })),
                ],
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
