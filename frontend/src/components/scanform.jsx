import React, { useState } from "react";
import "../styles/scanform.css";

const ScanForm = () => {
  const [url, setUrl] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    alert(`Scanning ${url} ...`);
  };

  return (
    <form onSubmit={handleSubmit} className="scan-form">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter URL to scan"
        required
      />
      <button type="submit">Scan Now</button>
    </form>
  );
};

export default ScanForm;
