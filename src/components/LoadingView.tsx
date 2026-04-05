"use client";

import { useState, useEffect } from "react";

const STEPS = [
  "Connecting to repository\u2026",
  "Parsing file structure & manifests\u2026",
  "Analyzing PR history & commits\u2026",
  "Inferring business context\u2026",
  "Building your Project Brief\u2026",
];

function IconLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="16" height="16" rx="4" fill="#2F2F2F" />
      <path
        d="M7 6h6M7 10h4M7 14h5"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 7l3 3 5-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LoadingView({
  onComplete,
  apiDone,
}: {
  onComplete: () => void;
  apiDone: boolean;
}) {
  const [step, setStep] = useState(0);
  const [animationDone, setAnimationDone] = useState(false);

  useEffect(() => {
    // Advance steps on a timer — each step shows for 900ms
    const timers = STEPS.map((_, i) =>
      setTimeout(() => setStep(i), i * 900)
    );

    // Mark animation as complete after all steps have played + a small buffer
    const doneTimer = setTimeout(
      () => setAnimationDone(true),
      STEPS.length * 900 + 400
    );

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
  }, []);

  useEffect(() => {
    // Only navigate once BOTH the animation has played through AND the API is done
    if (apiDone && animationDone) {
      const timer = setTimeout(onComplete, 300);
      return () => clearTimeout(timer);
    }
  }, [apiDone, animationDone, onComplete]);

  // If animation finishes before API, hold on last step (spinner keeps going)

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        gap: 32,
      }}
    >
      <div style={{ textAlign: "center" }}>
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 24,
            justifyContent: "center",
          }}
        >
          <IconLogo />
          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "rgb(55,53,47)",
              letterSpacing: "-0.02em",
            }}
          >
            RepoRecall
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: 280,
            height: 3,
            backgroundColor: "rgba(55,53,47,0.06)",
            borderRadius: 2,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: `${((step + 1) / STEPS.length) * 100}%`,
              height: "100%",
              backgroundColor: "rgb(35,131,226)",
              borderRadius: 2,
              transition: "width 0.6s ease",
            }}
          />
        </div>

        {/* Steps */}
        <div style={{ minHeight: 120 }}>
          {STEPS.map((s, i) => (
            <div
              key={i}
              style={{
                fontSize: 13,
                color:
                  i === step
                    ? "rgb(55,53,47)"
                    : i < step
                      ? "rgb(160,159,156)"
                      : "transparent",
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
                justifyContent: "center",
                transition: "color 0.3s",
              }}
            >
              {i < step ? (
                <span style={{ color: "rgb(15,123,108)" }}>
                  <IconCheck />
                </span>
              ) : i === step ? (
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 14,
                    border: "2px solid rgb(35,131,226)",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "loading-spin 0.7s linear infinite",
                  }}
                />
              ) : null}
              {s}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
