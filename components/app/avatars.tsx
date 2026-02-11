export function FhinAvatar({ size = 200 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200">
      <defs>
        <linearGradient id="gMetal" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F2DFA0" />
          <stop offset="18%" stopColor="#D4A843" />
          <stop offset="40%" stopColor="#A67C1E" />
          <stop offset="55%" stopColor="#7A5A12" />
          <stop offset="70%" stopColor="#A67C1E" />
          <stop offset="85%" stopColor="#D4A843" />
          <stop offset="100%" stopColor="#BF9530" />
        </linearGradient>
        <linearGradient id="gMetalFace" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#F2DFA0" stopOpacity="0.95" />
          <stop offset="25%" stopColor="#D4A843" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#8C6518" stopOpacity="0.7" />
          <stop offset="75%" stopColor="#A67C1E" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#D4A843" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="gHighlight" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#FFF8E1" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#F2DFA0" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#D4A843" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gShadow" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#D4A843" stopOpacity="0" />
          <stop offset="60%" stopColor="#6B4E10" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3D2D08" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="gEyeMetal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#BF9530" />
          <stop offset="30%" stopColor="#F2DFA0" />
          <stop offset="50%" stopColor="#FFFBE6" />
          <stop offset="70%" stopColor="#F2DFA0" />
          <stop offset="100%" stopColor="#BF9530" />
        </linearGradient>
        <linearGradient id="gMouthMetal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#A67C1E" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#E8C96A" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#A67C1E" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="gGlassMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF8E1" />
          <stop offset="20%" stopColor="#F2DFA0" />
          <stop offset="50%" stopColor="#A67C1E" />
          <stop offset="80%" stopColor="#D4A843" />
          <stop offset="100%" stopColor="#F2DFA0" />
        </linearGradient>
        <linearGradient id="gLensFill" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#D4A843" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#7A5A12" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="beam-fhin" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g>
        <g style={{ animation: 'breathe 4s ease-in-out infinite' }}>
          <ellipse cx="100" cy="100" rx="42" ry="52" fill="url(#gMetalFace)" />
          <ellipse cx="100" cy="77" rx="28" ry="22" fill="url(#gHighlight)" opacity="0.4" />
          <ellipse cx="100" cy="130" rx="32" ry="18" fill="url(#gShadow)" opacity="0.5" />
          <ellipse cx="100" cy="100" rx="42" ry="52" fill="none" stroke="url(#gMetal)" strokeWidth="2.5" />
          {/* Glasses */}
          <ellipse cx="82" cy="96" rx="13" ry="10" fill="url(#gLensFill)" />
          <ellipse cx="82" cy="96" rx="13" ry="10" fill="none" stroke="url(#gGlassMetal)" strokeWidth="2" />
          <ellipse cx="118" cy="96" rx="13" ry="10" fill="url(#gLensFill)" />
          <ellipse cx="118" cy="96" rx="13" ry="10" fill="none" stroke="url(#gGlassMetal)" strokeWidth="2" />
          <path d="M95 95 Q100 92 105 95" fill="none" stroke="url(#gGlassMetal)" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="69" y1="94" x2="60" y2="91" stroke="url(#gGlassMetal)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="131" y1="94" x2="140" y2="91" stroke="url(#gGlassMetal)" strokeWidth="1.5" strokeLinecap="round" />
          {/* Eyes */}
          <g style={{ animation: 'blink-fhin 4.2s ease-in-out infinite', transformOrigin: '100px 96px' }}>
            <rect x="76" y="95" width="12" height="2.5" rx="1.25" fill="url(#gEyeMetal)" opacity="0.9" />
            <rect x="112" y="95" width="12" height="2.5" rx="1.25" fill="url(#gEyeMetal)" opacity="0.9" />
            <circle cx="82" cy="96" r="1.6" fill="#FFFBE6" />
            <circle cx="118" cy="96" r="1.6" fill="#FFFBE6" />
          </g>
          <ellipse cx="77" cy="92" rx="4" ry="2.5" fill="#FFF8E1" opacity="0.06" />
          <ellipse cx="113" cy="92" rx="4" ry="2.5" fill="#FFF8E1" opacity="0.06" />
          <line x1="100" y1="104" x2="100" y2="114" stroke="url(#gMetal)" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
          {/* Mouth */}
          <g style={{ animation: 'talk-fhin 3.2s ease-in-out infinite', transformOrigin: '100px 122px' }}>
            <path d="M89 122 Q100 125 111 122" fill="none" stroke="url(#gMouthMetal)" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </g>
        <rect x="90" y="0" width="20" height="60" fill="url(#beam-fhin)" opacity="0.6" />
      </g>
    </svg>
  )
}

export function FinnAvatar({ size = 200 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200">
      <defs>
        <linearGradient id="cMetal" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#A8F0F0" />
          <stop offset="18%" stopColor="#3CC8C8" />
          <stop offset="40%" stopColor="#1A8A8C" />
          <stop offset="55%" stopColor="#0E5E60" />
          <stop offset="70%" stopColor="#1A8A8C" />
          <stop offset="85%" stopColor="#3CC8C8" />
          <stop offset="100%" stopColor="#2BB0B3" />
        </linearGradient>
        <linearGradient id="cMetalFace" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#A8F0F0" stopOpacity="0.95" />
          <stop offset="25%" stopColor="#3CC8C8" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#14706F" stopOpacity="0.7" />
          <stop offset="75%" stopColor="#1A8A8C" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#3CC8C8" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="cHighlight" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#E0FFFF" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#A8F0F0" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#3CC8C8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cShadow" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#3CC8C8" stopOpacity="0" />
          <stop offset="60%" stopColor="#0E4E50" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#072E30" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="cEyeMetal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2BB0B3" />
          <stop offset="30%" stopColor="#A8F0F0" />
          <stop offset="50%" stopColor="#E8FFFE" />
          <stop offset="70%" stopColor="#A8F0F0" />
          <stop offset="100%" stopColor="#2BB0B3" />
        </linearGradient>
        <linearGradient id="cMouthMetal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1A8A8C" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#6EDED8" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#1A8A8C" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="beam-finn" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g>
        <g style={{ animation: 'breathe 4.5s ease-in-out infinite' }}>
          <path d="M100 48 L140 72 L146 104 L136 134 L100 148 L64 134 L54 104 L60 72 Z" fill="url(#cMetalFace)" />
          <ellipse cx="100" cy="74" rx="26" ry="20" fill="url(#cHighlight)" opacity="0.4" />
          <ellipse cx="100" cy="130" rx="30" ry="16" fill="url(#cShadow)" opacity="0.5" />
          <path d="M100 48 L140 72 L146 104 L136 134 L100 148 L64 134 L54 104 L60 72 Z" fill="none" stroke="url(#cMetal)" strokeWidth="2.5" />
          {/* Eyes */}
          <g style={{ animation: 'blink-finn 3.8s ease-in-out infinite', transformOrigin: '100px 96px' }}>
            <rect x="74" y="94" width="17" height="3.5" rx="1.75" fill="url(#cEyeMetal)" transform="rotate(-3 82.5 95.75)" />
            <rect x="109" y="94" width="17" height="3.5" rx="1.75" fill="url(#cEyeMetal)" transform="rotate(3 117.5 95.75)" />
            <circle cx="84" cy="95.5" r="2" fill="#E8FFFE" />
            <circle cx="116" cy="95.5" r="2" fill="#E8FFFE" />
          </g>
          <line x1="100" y1="103" x2="100" y2="113" stroke="url(#cMetal)" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
          {/* Mouth */}
          <g style={{ animation: 'talk-finn 2.8s ease-in-out infinite', transformOrigin: '100px 121px' }}>
            <path d="M89 121 Q100 124 111 121" fill="none" stroke="url(#cMouthMetal)" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </g>
        <rect x="90" y="0" width="20" height="60" fill="url(#beam-finn)" opacity="0.6" />
      </g>
    </svg>
  )
}

export function FfinAvatar({ size = 200 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200">
      <defs>
        <linearGradient id="pMetal" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#C9A8E8" />
          <stop offset="18%" stopColor="#8B5CB8" />
          <stop offset="40%" stopColor="#5A3280" />
          <stop offset="55%" stopColor="#3E1F5E" />
          <stop offset="70%" stopColor="#5A3280" />
          <stop offset="85%" stopColor="#8B5CB8" />
          <stop offset="100%" stopColor="#7647A8" />
        </linearGradient>
        <linearGradient id="pMetalFace" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#C9A8E8" stopOpacity="0.95" />
          <stop offset="25%" stopColor="#8B5CB8" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#45276A" stopOpacity="0.7" />
          <stop offset="75%" stopColor="#5A3280" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#8B5CB8" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="pHighlight" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#EDE0FF" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#C9A8E8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#8B5CB8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pShadow" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#8B5CB8" stopOpacity="0" />
          <stop offset="60%" stopColor="#2E1548" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#1A0C2E" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="pEyeMetal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7647A8" />
          <stop offset="30%" stopColor="#C9A8E8" />
          <stop offset="50%" stopColor="#F0E6FF" />
          <stop offset="70%" stopColor="#C9A8E8" />
          <stop offset="100%" stopColor="#7647A8" />
        </linearGradient>
        <linearGradient id="pMouthMetal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5A3280" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#A87DD4" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#5A3280" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="pHatMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D8C0F0" />
          <stop offset="12%" stopColor="#C9A8E8" />
          <stop offset="30%" stopColor="#8B5CB8" />
          <stop offset="50%" stopColor="#5A3280" />
          <stop offset="65%" stopColor="#3E1F5E" />
          <stop offset="80%" stopColor="#5A3280" />
          <stop offset="92%" stopColor="#8B5CB8" />
          <stop offset="100%" stopColor="#7647A8" />
        </linearGradient>
        <linearGradient id="pHatBrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C9A8E8" />
          <stop offset="50%" stopColor="#7647A8" />
          <stop offset="100%" stopColor="#5A3280" />
        </linearGradient>
        <linearGradient id="pHatBand" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5A3280" />
          <stop offset="30%" stopColor="#C9A8E8" />
          <stop offset="50%" stopColor="#EDE0FF" />
          <stop offset="70%" stopColor="#C9A8E8" />
          <stop offset="100%" stopColor="#5A3280" />
        </linearGradient>
        <linearGradient id="pHatHighlight" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#EDE0FF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8B5CB8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="beam-ffin" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g>
        <g style={{ animation: 'breathe 5s ease-in-out infinite' }}>
          <ellipse cx="100" cy="104" rx="44" ry="50" fill="url(#pMetalFace)" />
          <ellipse cx="100" cy="82" rx="30" ry="20" fill="url(#pHighlight)" opacity="0.35" />
          <ellipse cx="100" cy="134" rx="34" ry="18" fill="url(#pShadow)" opacity="0.5" />
          <ellipse cx="100" cy="104" rx="44" ry="50" fill="none" stroke="url(#pMetal)" strokeWidth="2.5" />
          {/* Top hat */}
          <rect x="74" y="18" width="52" height="40" rx="4" fill="url(#pHatMetal)" />
          <rect x="74" y="18" width="52" height="40" rx="4" fill="none" stroke="url(#pMetal)" strokeWidth="1.2" />
          <rect x="74" y="49" width="52" height="5" fill="url(#pHatBand)" />
          <rect x="82" y="22" width="14" height="26" rx="7" fill="url(#pHatHighlight)" />
          <ellipse cx="100" cy="58" rx="38" ry="8" fill="url(#pHatBrim)" />
          <ellipse cx="100" cy="58" rx="38" ry="8" fill="none" stroke="url(#pMetal)" strokeWidth="1.5" />
          {/* Eyes */}
          <g style={{ animation: 'blink-ffin 4.6s ease-in-out infinite', transformOrigin: '100px 95px' }}>
            <path d="M75 97 Q83 92 91 97" fill="none" stroke="url(#pEyeMetal)" strokeWidth="3" strokeLinecap="round" />
            <path d="M109 97 Q117 92 125 97" fill="none" stroke="url(#pEyeMetal)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="83" cy="95" r="2" fill="#F0E6FF" />
            <circle cx="117" cy="95" r="2" fill="#F0E6FF" />
          </g>
          <line x1="100" y1="103" x2="100" y2="113" stroke="url(#pMetal)" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
          {/* Mouth */}
          <g style={{ animation: 'talk-ffin 3.6s ease-in-out infinite', transformOrigin: '100px 121px' }}>
            <path d="M89 121 Q100 124 111 121" fill="none" stroke="url(#pMouthMetal)" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </g>
        <rect x="90" y="0" width="20" height="22" fill="url(#beam-ffin)" opacity="0.6" />
      </g>
    </svg>
  )
}
