import React, { useState, useEffect } from 'react';
import FileCard from './FileCard';
import GraphVisualizer from './GraphVisualizer';
import './App.css';

// eslint-disable-next-line no-unused-vars
function App() {
  const [graphData, setGraphData] = useState({ call_graph: {}, nodes: [], links: [] });
  // eslint-disable-next-line no-unused-vars
  const [greetMessage, setGreetMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFunction, setSelectedFunction] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null); // State for error messages

  useEffect(() => {
    fetch('http://127.0.0.1:8000/')
      .then((response) => response.json())
      .then((data) => setGreetMessage(data.message))
      .catch((error) => setErrorMessage("Failed to fetch greeting message. Please try again later."));
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
          setErrorMessage(data.detail); // Display the error message from the backend
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
      .catch((error) => setErrorMessage("Error uploading files. Please try again later."));
  };

  const handleFileSelect = (fileName) => {
    setSelectedFile(fileName);
    setSelectedFunction(null); // Reset function selection when a new file is selected
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
    console.log("Call Graph Structure:", graphData.call_graph);
    console.log("Detailed Call Graph Structure:", JSON.stringify(graphData.call_graph, null, 2));
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

  // eslint-disable-next-line no-unused-vars
  const renderFileCards = () => {
    return Object.entries(graphData.call_graph || {}).map(([fileName, fileGraph]) => (
      <FileCard key={fileName} fileName={fileName} fileGraph={fileGraph} />
    ));
  };

  return (
    <div className="App">
      {renderErrorMessage()}

      <div className="file-hierarchy-container">
        {renderFileHierarchy()}
      </div>

      <div className="graph-area">
        <div className="toolbar">
          <span>MapMyCode</span>
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
        </div>

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
  );
}

export default App;
