import React from "react";
import { getNumericInputValue, normalizeNumericInputValue } from "../utils/numbers.js";

function ExerciseForm({ draft, error, onCancel, onChange, onSubmit }) {
  return (
    <form className="exercise-form" onSubmit={onSubmit}>
      <div className="field-stack">
        <label htmlFor="exercise-name">Nome esercizio</label>
        <input
          id="exercise-name"
          type="text"
          value={draft.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder="Es. Panca piana"
          autoComplete="off"
        />
        {error && <p className="field-error">{error}</p>}
      </div>

      <div className="two-column-fields">
        <div className="field-stack">
          <label htmlFor="exercise-sets">Serie</label>
          <input
            id="exercise-sets"
            type="number"
            value={getNumericInputValue(draft.sets)}
            onChange={(event) => onChange("sets", normalizeNumericInputValue(event.target.value))}
            placeholder="4"
            min="0"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>

        <div className="field-stack">
          <label htmlFor="exercise-reps">Ripetizioni</label>
          <input
            id="exercise-reps"
            type="number"
            value={getNumericInputValue(draft.reps)}
            onChange={(event) => onChange("reps", normalizeNumericInputValue(event.target.value))}
            placeholder="10"
            min="0"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="field-stack">
        <label htmlFor="exercise-weight">Carico</label>
        <div className="unit-input-row">
          <input
            id="exercise-weight"
            type="number"
            value={getNumericInputValue(draft.weight)}
            onChange={(event) => onChange("weight", normalizeNumericInputValue(event.target.value))}
            placeholder="70"
            min="0"
            step="0.25"
            inputMode="decimal"
            autoComplete="off"
          />
          <span aria-hidden="true">kg</span>
        </div>
      </div>

      <div className="field-stack">
        <label htmlFor="exercise-rest">Recupero</label>
        <div className="unit-input-row">
          <input
            id="exercise-rest"
            type="number"
            value={getNumericInputValue(draft.rest)}
            onChange={(event) => onChange("rest", normalizeNumericInputValue(event.target.value))}
            placeholder="90"
            min="0"
            step="5"
            inputMode="numeric"
            autoComplete="off"
          />
          <span aria-hidden="true">sec</span>
        </div>
      </div>

      <div className="field-stack">
        <label htmlFor="exercise-notes">Note</label>
        <textarea
          id="exercise-notes"
          value={draft.notes}
          onChange={(event) => onChange("notes", event.target.value)}
          placeholder="Es. ultima serie difficile"
          rows="3"
        />
      </div>

      <div className="form-actions">
        <button type="submit">Aggiungi esercizio</button>
        <button className="ghost-button" type="button" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </form>
  );
}

export default ExerciseForm;
