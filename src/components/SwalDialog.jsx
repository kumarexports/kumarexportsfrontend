function SwalDialog({ open, title, text, kind = 'success', onClose }) {
  if (!open) {
    return null
  }

  return (
    <div className="swal-backdrop" onClick={onClose}>
      <div
        className={`swal-card ${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="swal-title">{title}</h3>
        <p style={{ whiteSpace: 'pre-line' }}>{text}</p>
        <button type="button" className="primary-btn" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  )
}

export default SwalDialog
