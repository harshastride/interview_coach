import React from 'react';

export type AvatarState = 'speaking' | 'listening' | 'thinking' | 'idle';

interface InterviewAvatarProps {
  state: AvatarState;
}

/**
 * Animated SVG avatar for interview practice.
 * Pure CSS animations — no JS loop, no external assets.
 */
export default function InterviewAvatar({ state }: InterviewAvatarProps) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 relative overflow-hidden">
      {/* Subtle background circles */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 rounded-full bg-blue-400 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-24 h-24 rounded-full bg-indigo-400 blur-3xl" />
      </div>

      {/* Avatar container */}
      <div className={`relative transition-transform duration-700 ${state === 'thinking' ? 'avatar-thinking' : ''}`}>
        <svg
          viewBox="0 0 200 220"
          className="w-32 h-36 sm:w-40 sm:h-44 md:w-48 md:h-52"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Body / Shoulders */}
          <ellipse cx="100" cy="210" rx="65" ry="30" fill="#3B5998" opacity="0.9" />
          <rect x="60" y="160" width="80" height="55" rx="10" fill="#3B5998" />
          {/* Collar */}
          <path d="M80 160 L100 180 L120 160" fill="none" stroke="#fff" strokeWidth="2" opacity="0.5" />

          {/* Neck */}
          <rect x="90" y="145" width="20" height="20" rx="4" fill="#E8C4A0" />

          {/* Head */}
          <g className={state === 'listening' ? 'avatar-nod' : state === 'speaking' ? 'avatar-speak-head' : 'avatar-breathe'}>
            <ellipse cx="100" cy="100" rx="52" ry="58" fill="#F0D0A8" />

            {/* Hair */}
            <path d="M48 90 Q48 42 100 42 Q152 42 152 90 L152 75 Q152 35 100 35 Q48 35 48 75 Z" fill="#3D2B1F" />
            <path d="M48 75 Q45 85 48 95" fill="#3D2B1F" stroke="#3D2B1F" strokeWidth="3" />
            <path d="M152 75 Q155 85 152 95" fill="#3D2B1F" stroke="#3D2B1F" strokeWidth="3" />

            {/* Eyebrows */}
            <g className={state === 'thinking' ? 'avatar-eyebrow-raise' : ''}>
              <path d="M72 78 Q80 74 88 78" fill="none" stroke="#3D2B1F" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M112 78 Q120 74 128 78" fill="none" stroke="#3D2B1F" strokeWidth="2.5" strokeLinecap="round" />
            </g>

            {/* Eyes */}
            <g className={`${state === 'thinking' ? 'avatar-eyes-shift' : ''}`}>
              {/* Left eye */}
              <g className="avatar-blink">
                <ellipse cx="80" cy="92" rx="8" ry="9" fill="white" />
                <circle cx="80" cy="92" r="5" fill="#2C1810" />
                <circle cx="82" cy="90" r="2" fill="white" opacity="0.8" />
              </g>
              {/* Right eye */}
              <g className="avatar-blink">
                <ellipse cx="120" cy="92" rx="8" ry="9" fill="white" />
                <circle cx="120" cy="92" r="5" fill="#2C1810" />
                <circle cx="122" cy="90" r="2" fill="white" opacity="0.8" />
              </g>
            </g>

            {/* Nose */}
            <path d="M97 100 Q100 110 103 100" fill="none" stroke="#D4A574" strokeWidth="1.5" strokeLinecap="round" />

            {/* Mouth */}
            {state === 'speaking' ? (
              <g className="avatar-mouth-speak">
                <ellipse cx="100" cy="122" rx="10" ry="6" fill="#C0392B" />
                <ellipse cx="100" cy="120" rx="8" ry="2" fill="#E8C4A0" />
              </g>
            ) : (
              <path
                d="M88 120 Q100 130 112 120"
                fill="none"
                stroke="#B87A5A"
                strokeWidth="2.5"
                strokeLinecap="round"
                className={state === 'listening' ? 'avatar-smile' : ''}
              />
            )}

            {/* Cheek blush */}
            <circle cx="65" cy="108" r="8" fill="#F5A0A0" opacity="0.2" />
            <circle cx="135" cy="108" r="8" fill="#F5A0A0" opacity="0.2" />

            {/* Ears */}
            <ellipse cx="48" cy="98" rx="6" ry="10" fill="#E8BE98" />
            <ellipse cx="152" cy="98" rx="6" ry="10" fill="#E8BE98" />
          </g>
        </svg>

        {/* State indicator label */}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
          <span className={`
            inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold tracking-wide uppercase
            ${state === 'speaking' ? 'bg-blue-500/20 text-blue-300' : ''}
            ${state === 'listening' ? 'bg-emerald-500/20 text-emerald-300' : ''}
            ${state === 'thinking' ? 'bg-amber-500/20 text-amber-300' : ''}
            ${state === 'idle' ? 'bg-slate-500/20 text-slate-400' : ''}
          `}>
            {state === 'speaking' && <><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> Speaking</>}
            {state === 'listening' && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Listening</>}
            {state === 'thinking' && <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Thinking</>}
            {state === 'idle' && <><span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Ready</>}
          </span>
        </div>
      </div>

      {/* Inline styles for CSS keyframe animations */}
      <style>{`
        /* Blink every ~4 seconds */
        .avatar-blink {
          animation: blink 4s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 94%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.05); }
        }

        /* Breathing — subtle scale */
        .avatar-breathe {
          animation: breathe 4s ease-in-out infinite;
          transform-origin: center 120px;
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.01); }
        }

        /* Speaking — head micro-movement */
        .avatar-speak-head {
          animation: speakHead 0.6s ease-in-out infinite;
          transform-origin: center 120px;
        }
        @keyframes speakHead {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          25% { transform: rotate(0.5deg) translateY(-0.5px); }
          75% { transform: rotate(-0.5deg) translateY(0.5px); }
        }

        /* Speaking mouth */
        .avatar-mouth-speak ellipse:first-child {
          animation: mouthOpen 0.35s ease-in-out infinite alternate;
        }
        @keyframes mouthOpen {
          0% { ry: 3; }
          100% { ry: 7; }
        }

        /* Listening — nod */
        .avatar-nod {
          animation: nod 2s ease-in-out infinite;
          transform-origin: center 120px;
        }
        @keyframes nod {
          0%, 100% { transform: rotate(0deg); }
          30% { transform: rotate(2.5deg); }
          60% { transform: rotate(-1deg); }
        }

        /* Listening — wider smile */
        .avatar-smile {
          animation: smile 2s ease-in-out infinite;
        }
        @keyframes smile {
          0%, 100% { d: path("M88 120 Q100 130 112 120"); }
          50% { d: path("M85 120 Q100 133 115 120"); }
        }

        /* Thinking — eyes shift */
        .avatar-eyes-shift {
          animation: eyeShift 3s ease-in-out infinite;
        }
        @keyframes eyeShift {
          0%, 100% { transform: translateX(0); }
          40% { transform: translateX(-3px); }
          70% { transform: translateX(2px); }
        }

        /* Thinking — head tilt */
        .avatar-thinking {
          animation: headTilt 3s ease-in-out infinite;
        }
        @keyframes headTilt {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-3deg); }
        }

        /* Thinking — eyebrow raise */
        .avatar-eyebrow-raise {
          animation: browRaise 3s ease-in-out infinite;
        }
        @keyframes browRaise {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}
