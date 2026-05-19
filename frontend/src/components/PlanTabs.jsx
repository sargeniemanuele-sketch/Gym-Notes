import React from "react";

const TABS = [
  { id: "workouts", label: "Allenamenti" },
  { id: "history", label: "Storico" },
  { id: "progress", label: "Progressi" }
];

function PlanTabs({ activeTab, onTabChange }) {
  return (
    <div className="plan-tabs" role="tablist">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          className={`plan-tab${activeTab === id ? " plan-tab--active" : ""}`}
          role="tab"
          aria-selected={activeTab === id}
          type="button"
          onClick={() => onTabChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default PlanTabs;
