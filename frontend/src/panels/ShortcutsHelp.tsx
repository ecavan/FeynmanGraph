const SHORTCUTS: [string, string][] = [
  ["⌘Z / Ctrl+Z", "Undo"],
  ["⇧⌘Z / Ctrl+⇧Z", "Redo"],
  ["Delete / Backspace", "Remove the selected node or edge"],
  ["Esc", "Close menus / cancel edge draft"],
];

export function ShortcutsHelp() {
  return (
    <div data-testid="shortcuts-help" style={{ fontSize: 13 }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Keyboard shortcuts</h3>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {SHORTCUTS.map(([keys, desc]) => (
            <tr key={keys}>
              <td
                style={{
                  padding: "3px 10px 3px 0",
                  whiteSpace: "nowrap",
                  verticalAlign: "top",
                }}
              >
                <kbd
                  style={{
                    background: "#f1f1f1",
                    border: "1px solid #ccc",
                    borderRadius: 3,
                    padding: "1px 5px",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 12,
                  }}
                >
                  {keys}
                </kbd>
              </td>
              <td style={{ padding: "3px 0", color: "#333" }}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
