// ✅ src/components/Modal.js
import React from "react";
import "./Modal.css"; // 스타일은 따로 관리할 수도 있음

function Modal({ children, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose} className="modal-close">✖</button>
        {children}
      </div>
    </div>
  );
}

export default Modal;
