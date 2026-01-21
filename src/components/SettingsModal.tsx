"use client";

import { useEffect, useState } from "react";
import styles from "./SettingsModal.module.css";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch("/api/keys")
        .then((res) => res.json())
        .then((data) => {
          setApiKey(data.openaiApiKey || "");
          setSaveStatus("idle");
        })
        .catch((err) => {
          console.error("Failed to load API key:", err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const handleSaveApiKey = async () => {
    setSaveStatus("saving");
    try {
      await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiApiKey: apiKey }),
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save API key:", err);
      setSaveStatus("idle");
    }
  };

  const handleClearApiKey = async () => {
    try {
      await fetch("/api/keys", { method: "DELETE" });
      setApiKey("");
      setSaveStatus("idle");
    } catch (err) {
      console.error("Failed to clear API key:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className={styles.content}>
          <div className={styles.section}>
            <label className={styles.label} htmlFor="openai-api-key">
              OpenAI API Key
            </label>
            <p className={styles.description}>
              Your API key is stored securely in a local config file.
            </p>
            <div className={styles.inputGroup}>
              <input
                id="openai-api-key"
                type={showApiKey ? "text" : "password"}
                className={styles.input}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isLoading ? "Loading..." : "sk-..."}
                disabled={isLoading}
              />
              <button
                type="button"
                className={styles.toggleButton}
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div className={styles.buttonGroup}>
              <button
                className={styles.saveButton}
                onClick={handleSaveApiKey}
                disabled={!apiKey.trim() || saveStatus === "saving"}
              >
                {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Save"}
              </button>
              <button
                className={styles.clearButton}
                onClick={handleClearApiKey}
                disabled={!apiKey}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
