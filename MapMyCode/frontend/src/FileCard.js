import React from 'react';
import './FileCard.css';

const FileCard = ({ fileName, fileGraph }) => {
  return (
    <div className="file-card">
      <h2>{fileName}</h2>
      <ul>
        {Object.entries(fileGraph).map(([functionName, details]) => {
          const calls = Array.isArray(details.calls) ? details.calls : [];
          const calledBy = Array.isArray(details.called_by) ? details.called_by : [];

          return (
            <li key={functionName}>
              <strong>{functionName}</strong> (Line: {details.line})
              <ul>
                <li>Calls:
                  <ul>
                    {calls.map((call, index) => (
                      <li key={index}>{call.function} (Line: {call.line})</li>
                    ))}
                  </ul>
                </li>
                <li>Called By:
                  <ul>
                    {calledBy.map((caller, index) => (
                      <li key={index}>{caller.function} (Line: {caller.line})</li>
                    ))}
                  </ul>
                </li>
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default FileCard;