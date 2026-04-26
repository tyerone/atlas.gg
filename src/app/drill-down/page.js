'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AtlasLogo from '@/components/AtlasLogo';
import styles from './drill-down.module.css';

// ─── CHAMPION NAME MAP ────────────────────────────────────────
const CHAMP_NAME_MAP = {
  'Wukong':         'MonkeyKing',
  'Nunu & Willump': 'Nunu',
  'Renata Glasc':   'Renata',
  "Bel'Veth":       'Belveth',
  "Cho'Gath":       'Chogath',
  "Kai'Sa":         'Kaisa',
  "Kha'Zix":        'Khazix',
  "Kog'Maw":        'KogMaw',
  "LeBlanc":        'Leblanc',
  "Rek'Sai":        'RekSai',
  "Vel'Koz":        'Velkoz',
  "K'Sante":        'KSante',
  "Aurelion Sol":   'AurelionSol',
  "Jarvan IV":      'JarvanIV',
  "Lee Sin":        'LeeSin',
  "Master Yi":      'MasterYi',
  "Miss Fortune":   'MissFortune',
  "Tahm Kench":     'TahmKench',
  "Twisted Fate":   'TwistedFate',
  "Xin Zhao":       'XinZhao',
};

function getDDragonName(champion) {
  return CHAMP_NAME_MAP[champion] || champion.replace(/[\s'.]/g, '');
}

// ─── MAP CONSTANTS ────────────────────────────────────────────
const MAP_GAME_WIDTH  = 14820;
const MAP_GAME_HEIGHT = 14881;
const SVG_W = 300;
const SVG_H = 240;
const MAP_PAD = 8;
const MAP_W = SVG_W - MAP_PAD * 2;
const MAP_H = SVG_H - MAP_PAD * 2;
const PATCH_FALLBACK = '14.8.1';

function gameToPixel(gameX, gameY) {
  const px = MAP_PAD + (gameX / MAP_GAME_WIDTH) * MAP_W;
  const py = MAP_PAD + (1 - gameY / MAP_GAME_HEIGHT) * MAP_H;
  return { px, py };
}

// ─── MOCK GAMES DATA ─────────────────────────────────────────
const MOCK_GAMES = [
  {
    gameNum:   1,
    champion:  'Jinx',
    result:    'Win',
    queue:     'Ranked Solo',
    duration:  '32m',
    matchId:   'NA1-5823901234',
    kda:       '8/3/11',
    cs:        234,
    csPerMin:  7.3,
    vision:    28,
    hasPattern: true,
    phases: [
      { label: 'Early', pct: 80, color: 'blue'  },
      { label: 'Mid',   pct: 52, color: 'amber' },
      { label: 'Late',  pct: 71, color: 'blue'  },
    ],
    participants: [
      { id: 1,  champion: 'Jinx',     team: 'ally',  isSelf: true,  gameX: 10200, gameY: 3900 },
      { id: 2,  champion: 'Thresh',   team: 'ally',  isSelf: false, gameX: 7200,  gameY: 3800 },
      { id: 3,  champion: 'Nautilus', team: 'ally',  isSelf: false, gameX: 6800,  gameY: 8200 },
      { id: 4,  champion: 'Azir',     team: 'ally',  isSelf: false, gameX: 7500,  gameY: 7200 },
      { id: 5,  champion: 'Vi',       team: 'ally',  isSelf: false, gameX: 5200,  gameY: 9800 },
      { id: 6,  champion: 'Caitlyn',  team: 'enemy', isSelf: false, gameX: 11200, gameY: 4800 },
      { id: 7,  champion: 'Lux',      team: 'enemy', isSelf: false, gameX: 10800, gameY: 4200 },
      { id: 8,  champion: 'Zed',      team: 'enemy', isSelf: false, gameX: 9000,  gameY: 7200 },
      { id: 9,  champion: 'Hecarim',  team: 'enemy', isSelf: false, gameX: 8200,  gameY: 6000 },
      { id: 10, champion: 'Fiora',    team: 'enemy', isSelf: false, gameX: 12400, gameY: 11200 },
    ],
    wards: [{ gameX: 8400, gameY: 5200 }, { gameX: 7800, gameY: 4600 }],
    death: { gameX: 10200, gameY: 3900, timestamp: '19:15' },
    whyHere: {
      pattern: 'Overextension at 19:15',
      desc: 'Pushed past river without vision. Matches your cross-game overextension pattern.',
      timestamp: '19:15',
    },
    tabs: {
      positioning: [
        { title: 'Overextension — river', text: 'Pushed past river in mid-game without vision. Matches cross-game pattern.', timestamp: '19:15', highlighted: true, snapshot: 'Pushed past river at 19:15 with enemy jungle untracked. Died to a 3-man dive within 6 seconds of crossing the river boundary.' },
        { title: 'Death clustering', text: '2 deaths within 200 units of the same river entry this game.', timestamp: '24:40', highlighted: false, snapshot: 'Second death at the same river entry point. No ward coverage in this area. Pattern consistent with Games 3 and 4.' },
      ],
      vision: [
        { title: 'Ward clustering', text: 'Wards placed in the same spots as 3 other games — predictable.', timestamp: '15:00', highlighted: false, snapshot: 'Standard river bush ward used again. Enemy support is likely tracking this ward spot across games.' },
      ],
      macro: [
        { title: 'Objective presence', text: 'Present for Dragon fight at 22:10 — good rotation timing.', timestamp: '22:10', highlighted: false, snapshot: 'Good read on Dragon timer — rotated with 45 seconds to spare. Team won the fight 5v4.' },
      ],
    },
  },
  {
    gameNum:   2,
    champion:  'Jinx',
    result:    'Loss',
    queue:     'Ranked Solo',
    duration:  '28m',
    matchId:   'NA1-5823891122',
    kda:       '3/8/4',
    cs:        187,
    csPerMin:  6.7,
    vision:    19,
    hasPattern: true,
    phases: [
      { label: 'Early', pct: 65, color: 'blue'  },
      { label: 'Mid',   pct: 28, color: 'red'   },
      { label: 'Late',  pct: 40, color: 'red'   },
    ],
    participants: [
      { id: 1,  champion: 'Jinx',     team: 'ally',  isSelf: true,  gameX: 9800,  gameY: 4400 },
      { id: 2,  champion: 'Thresh',   team: 'ally',  isSelf: false, gameX: 7000,  gameY: 3600 },
      { id: 3,  champion: 'Malphite', team: 'ally',  isSelf: false, gameX: 6400,  gameY: 8600 },
      { id: 4,  champion: 'Viktor',   team: 'ally',  isSelf: false, gameX: 7200,  gameY: 7400 },
      { id: 5,  champion: 'Elise',    team: 'ally',  isSelf: false, gameX: 5600,  gameY: 9400 },
      { id: 6,  champion: 'Caitlyn',  team: 'enemy', isSelf: false, gameX: 10400, gameY: 5100 },
      { id: 7,  champion: 'Lux',      team: 'enemy', isSelf: false, gameX: 10800, gameY: 4200 },
      { id: 8,  champion: 'Zed',      team: 'enemy', isSelf: false, gameX: 9200,  gameY: 3900 },
      { id: 9,  champion: 'Hecarim',  team: 'enemy', isSelf: false, gameX: 8800,  gameY: 6400 },
      { id: 10, champion: 'Fiora',    team: 'enemy', isSelf: false, gameX: 12400, gameY: 11200 },
    ],
    wards: [{ gameX: 7800, gameY: 5600 }, { gameX: 8200, gameY: 4800 }, { gameX: 7400, gameY: 4200 }],
    death: { gameX: 9800, gameY: 4400, timestamp: '15:42' },
    whyHere: {
      pattern: 'Overextension at 15:42',
      desc: 'Pushed past river without vision. This matches your cross-game overextension pattern — died within 8 seconds.',
      timestamp: '15:42',
    },
    tabs: {
      positioning: [
        { title: 'Overextension — river', text: 'Pushed past river without jungle support. 3 enemies nearby. Died within 8s.', timestamp: '15:42', highlighted: true, snapshot: '3 enemies missing from minimap. Pushed past river without vision. Support was recalling. Died 8 seconds after crossing the river boundary — core pattern game.' },
        { title: 'Early lane positioning', text: 'Farming closer to enemy tower — high gank risk in early game.', timestamp: '08:20', highlighted: false, snapshot: 'Farming within 150 units of enemy tower at 8:20. Enemy jungler cleared bot scuttle 40 seconds prior — high risk.' },
        { title: 'Death clustering', text: '3 of 8 deaths within 200 units of same river entry this game.', timestamp: '22:05', highlighted: false, snapshot: 'Third death in same river entry point. No ward coverage for 4 minutes prior. Repeats across Games 1, 2, and 4.' },
      ],
      vision: [
        { title: 'Ward clustering', text: 'Same 2 ward spots used — predictable pattern across games.', timestamp: '12:10', highlighted: false, snapshot: 'Ward placed in standard river bush again. Enemy support tracking this placement across games.' },
        { title: 'Death without vision', text: 'No active wards within 1000 units of death location at 15:42.', timestamp: '15:42', highlighted: false, snapshot: 'No active wards within 1000 game units of death at 15:42. Area unwardded for over 3 minutes.' },
      ],
      macro: [
        { title: 'Dragon absence', text: 'Team contested Dragon at 22:40 — you were farming top side alone.', timestamp: '22:40', highlighted: false, snapshot: 'Team engaged Dragon at 22:40. You were 200 units into top side. Team fought 4v5 and lost objective.' },
        { title: 'Base timing', text: 'Backed at 17:50 — Dragon spawned at 18:00. Team lost 4v5.', timestamp: '17:50', highlighted: false, snapshot: 'Backed at 17:50 with Dragon spawning in 10 seconds. Could have stayed. Team lost without ADC damage.' },
      ],
    },
  },
  {
    gameNum:   3,
    champion:  'Caitlyn',
    result:    'Win',
    queue:     'Ranked Solo',
    duration:  '41m',
    matchId:   'NA1-5823801045',
    kda:       '12/4/7',
    cs:        301,
    csPerMin:  7.3,
    vision:    34,
    hasPattern: false,
    phases: [
      { label: 'Early', pct: 82, color: 'blue' },
      { label: 'Mid',   pct: 74, color: 'blue' },
      { label: 'Late',  pct: 68, color: 'blue' },
    ],
    participants: [
      { id: 1,  champion: 'Caitlyn',  team: 'ally',  isSelf: true,  gameX: 6800,  gameY: 6400 },
      { id: 2,  champion: 'Thresh',   team: 'ally',  isSelf: false, gameX: 7800,  gameY: 5200 },
      { id: 3,  champion: 'Malphite', team: 'ally',  isSelf: false, gameX: 4200,  gameY: 10800 },
      { id: 4,  champion: 'Orianna',  team: 'ally',  isSelf: false, gameX: 7400,  gameY: 7600 },
      { id: 5,  champion: 'Jarvan IV',team: 'ally',  isSelf: false, gameX: 6200,  gameY: 8400 },
      { id: 6,  champion: 'Jinx',     team: 'enemy', isSelf: false, gameX: 9800,  gameY: 5800 },
      { id: 7,  champion: 'Nautilus', team: 'enemy', isSelf: false, gameX: 10200, gameY: 5200 },
      { id: 8,  champion: 'Yasuo',    team: 'enemy', isSelf: false, gameX: 8200,  gameY: 7800 },
      { id: 9,  champion: 'Elise',    team: 'enemy', isSelf: false, gameX: 9400,  gameY: 6800 },
      { id: 10, champion: 'Fiora',    team: 'enemy', isSelf: false, gameX: 12800, gameY: 10400 },
    ],
    wards: [{ gameX: 8600, gameY: 6000 }, { gameX: 7200, gameY: 5800 }, { gameX: 9000, gameY: 7200 }],
    death: null,
    whyHere: null,
    tabs: {
      positioning: [
        { title: 'Good lane control', text: 'Maintained safe positioning throughout — no overextension this game.', timestamp: '20:00', highlighted: false, snapshot: 'Positioned safely behind minion wave throughout. No deaths past river this game — good read on enemy positioning.' },
      ],
      vision: [
        { title: 'Vision score', text: 'Above average vision score (34) — strong warding coverage this game.', timestamp: '25:00', highlighted: false, snapshot: 'Ward placement varied across different bushes — less predictable than other games. Enemy had less information.' },
      ],
      macro: [
        { title: 'Objective presence', text: 'Present for all 4 Dragon fights — strong objective awareness.', timestamp: '22:00', highlighted: false, snapshot: 'Rotated to Dragon with 60 seconds to spare in all 4 fights. Team won 3 of 4 Dragon fights this game.' },
      ],
    },
  },
  {
    gameNum:   4,
    champion:  'Jinx',
    result:    'Loss',
    queue:     'Ranked Solo',
    duration:  '24m',
    matchId:   'NA1-5823756789',
    kda:       '2/6/3',
    cs:        143,
    csPerMin:  5.9,
    vision:    16,
    hasPattern: true,
    phases: [
      { label: 'Early', pct: 58, color: 'amber' },
      { label: 'Mid',   pct: 22, color: 'red'   },
      { label: 'Late',  pct: 30, color: 'red'   },
    ],
    participants: [
      { id: 1,  champion: 'Jinx',     team: 'ally',  isSelf: true,  gameX: 9600,  gameY: 4600 },
      { id: 2,  champion: 'Lux',      team: 'ally',  isSelf: false, gameX: 6800,  gameY: 4200 },
      { id: 3,  champion: 'Malphite', team: 'ally',  isSelf: false, gameX: 5800,  gameY: 9200 },
      { id: 4,  champion: 'Azir',     team: 'ally',  isSelf: false, gameX: 7200,  gameY: 7200 },
      { id: 5,  champion: 'Vi',       team: 'ally',  isSelf: false, gameX: 4800,  gameY: 10200 },
      { id: 6,  champion: 'Caitlyn',  team: 'enemy', isSelf: false, gameX: 10600, gameY: 4800 },
      { id: 7,  champion: 'Thresh',   team: 'enemy', isSelf: false, gameX: 11000, gameY: 4000 },
      { id: 8,  champion: 'Zed',      team: 'enemy', isSelf: false, gameX: 9400,  gameY: 3600 },
      { id: 9,  champion: 'Hecarim',  team: 'enemy', isSelf: false, gameX: 8600,  gameY: 6600 },
      { id: 10, champion: 'Fiora',    team: 'enemy', isSelf: false, gameX: 12200, gameY: 11400 },
    ],
    wards: [{ gameX: 7600, gameY: 5400 }],
    death: { gameX: 9600, gameY: 4600, timestamp: '14:18' },
    whyHere: {
      pattern: 'Overextension at 14:18',
      desc: 'Earliest overextension in the dataset — barely mid-game.',
      timestamp: '14:18',
    },
    tabs: {
      positioning: [
        { title: 'Overextension — river', text: 'Earliest overextension in the dataset — 14:18, barely mid-game.', timestamp: '14:18', highlighted: true, snapshot: 'Overextension at 14:18 — earliest in the cross-game dataset. Enemy jungler was untracked for 2 minutes before the death.' },
        { title: 'Worst phase performance', text: 'Lowest mid-game score of all 5 analyzed games (22%).', timestamp: '16:00', highlighted: false, snapshot: 'Mid-game phase performance dropped significantly after the 14:18 death — snowballed into 3 more deaths in quick succession.' },
      ],
      vision: [
        { title: 'Low vision score', text: 'Vision score of 16 — lowest in the analyzed set. Only 1 ward placed.', timestamp: '20:00', highlighted: false, snapshot: 'Only 1 ward placed in this game — far below the 3 placed in other games. Contributed to the early overextension death.' },
      ],
      macro: [
        { title: 'Early surrender', text: 'Game ended at 24m — team voted to surrender after repeated deaths.', timestamp: '24:00', highlighted: false, snapshot: 'Team surrendered at 24 minutes. The early overextension pattern accelerated the loss — opponent snowballed from the 14:18 kill.' },
      ],
    },
  },
  {
    gameNum:   5,
    champion:  'Jinx',
    result:    'Win',
    queue:     'Ranked Solo',
    duration:  '35m',
    matchId:   'NA1-5823698234',
    kda:       '9/2/14',
    cs:        267,
    csPerMin:  7.6,
    vision:    31,
    hasPattern: true,
    phases: [
      { label: 'Early', pct: 78, color: 'blue'  },
      { label: 'Mid',   pct: 44, color: 'amber' },
      { label: 'Late',  pct: 82, color: 'blue'  },
    ],
    participants: [
      { id: 1,  champion: 'Jinx',     team: 'ally',  isSelf: true,  gameX: 10100, gameY: 4200 },
      { id: 2,  champion: 'Nautilus', team: 'ally',  isSelf: false, gameX: 7400,  gameY: 3600 },
      { id: 3,  champion: 'Malphite', team: 'ally',  isSelf: false, gameX: 6200,  gameY: 9000 },
      { id: 4,  champion: 'Azir',     team: 'ally',  isSelf: false, gameX: 7600,  gameY: 7000 },
      { id: 5,  champion: 'Vi',       team: 'ally',  isSelf: false, gameX: 5400,  gameY: 9600 },
      { id: 6,  champion: 'Xayah',    team: 'enemy', isSelf: false, gameX: 10800, gameY: 5000 },
      { id: 7,  champion: 'Thresh',   team: 'enemy', isSelf: false, gameX: 11200, gameY: 4400 },
      { id: 8,  champion: 'Yasuo',    team: 'enemy', isSelf: false, gameX: 8800,  gameY: 7600 },
      { id: 9,  champion: 'Hecarim',  team: 'enemy', isSelf: false, gameX: 9000,  gameY: 6200 },
      { id: 10, champion: 'Fiora',    team: 'enemy', isSelf: false, gameX: 12600, gameY: 10800 },
    ],
    wards: [{ gameX: 8000, gameY: 5400 }, { gameX: 7600, gameY: 4400 }, { gameX: 8800, gameY: 6800 }],
    death: { gameX: 10100, gameY: 4200, timestamp: '18:30' },
    whyHere: {
      pattern: 'Overextension at 18:30',
      desc: 'Pattern present but recovered — died once then played safer.',
      timestamp: '18:30',
    },
    tabs: {
      positioning: [
        { title: 'Overextension — river', text: 'Pattern present but recovered — died once then played safer.', timestamp: '18:30', highlighted: true, snapshot: 'Overextension at 18:30 — died once to the same river entry. Adjusted positioning after this death and went on to win the game.' },
        { title: 'Improved mid-game', text: 'After 18:30 death, positioning improved significantly for the rest of game.', timestamp: '25:00', highlighted: false, snapshot: 'Post-18:30, positioned closer to allies in every subsequent teamfight. Late-game phase score jumped to 82% as a result.' },
      ],
      vision: [
        { title: 'Good ward coverage', text: '3 wards placed — better coverage than Games 2 and 4.', timestamp: '20:00', highlighted: false, snapshot: 'Ward placement in 3 different spots — less predictable than usual. Enemy had less vision information.' },
      ],
      macro: [
        { title: 'Late game impact', text: 'Strong late game carry — 82% late phase score, highest in analyzed set.', timestamp: '30:00', highlighted: false, snapshot: 'Late game performance was excellent. Positioned safely in teamfights and carried 3 of the last 4 fights.' },
      ],
    },
  },
];

const TAB_LABELS = ['Positioning', 'Vision', 'Macro'];
const TAB_KEYS   = ['positioning', 'vision', 'macro'];

// ─── MAP COMPONENTS ──────────────────────────────────────────
function ChampDot({ participant, patch, size = 28 }) {
  const ddName = getDDragonName(participant.champion);
  const imgUrl = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${ddName}.png`;
  const { px, py } = gameToPixel(participant.gameX, participant.gameY);
  const clipId = `clip-${participant.id}-${participant.champion}`;
  const r = size / 2;
  const ringColor = participant.isSelf ? '#ffffff' : participant.team === 'ally' ? '#4f8ef7' : '#E24B4A';

  return (
    <g>
      {participant.isSelf && (
        <>
          <circle cx={px} cy={py} r={r + 8} fill="rgba(226,75,74,0.12)" />
          <circle cx={px} cy={py} r={r + 4} fill="rgba(226,75,74,0.22)" />
        </>
      )}
      <defs>
        <clipPath id={clipId}>
          <circle cx={px} cy={py} r={r} />
        </clipPath>
      </defs>
      <circle cx={px} cy={py} r={r} fill={participant.team === 'ally' ? 'rgba(79,142,247,0.3)' : 'rgba(226,75,74,0.3)'} />
      <image
        href={imgUrl}
        x={px - r - 2} y={py - r - 2}
        width={(r + 2) * 2} height={(r + 2) * 2}
        clipPath={`url(#${clipId})`}
        preserveAspectRatio="xMidYMid slice"
      />
      <circle cx={px} cy={py} r={r} fill="none" stroke={ringColor} strokeWidth={participant.isSelf ? 2.5 : 1.5} />
      {participant.isSelf && (
        <text x={px} y={py + r + 11} textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#E24B4A" fontWeight="bold">
          ✕
        </text>
      )}
    </g>
  );
}

function WardDot({ ward }) {
  const { px, py } = gameToPixel(ward.gameX, ward.gameY);
  return (
    <circle cx={px} cy={py} r="5" fill="rgba(79,142,247,0.3)" stroke="#4f8ef7" strokeWidth="1.5" />
  );
}

function GameMap({ game, patch, snapshotTs }) {
  const self = game.participants.find(p => p.isSelf);
  const { px: selfPx, py: selfPy } = self ? gameToPixel(self.gameX, self.gameY) : { px: 0, py: 0 };
  const pathStartX = MAP_PAD + (580 / MAP_GAME_WIDTH) * MAP_W;
  const pathStartY = MAP_PAD + (1 - 460 / MAP_GAME_HEIGHT) * MAP_H;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="xMidYMid meet">
      <rect width={SVG_W} height={SVG_H} fill="#0d1117" />
      <image href="/map.png" x={MAP_PAD} y={MAP_PAD} width={MAP_W} height={MAP_H} preserveAspectRatio="xMidYMid slice" opacity="0.35" />
      <rect x={MAP_PAD} y={MAP_PAD} width={MAP_W} height={MAP_H} rx="5" fill="rgba(13,17,23,0.45)" />
      <rect x={MAP_PAD} y={MAP_PAD} width={MAP_W} height={MAP_H} rx="5" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      {/* River */}
      <line x1={MAP_PAD} y1={MAP_PAD + MAP_H} x2={MAP_PAD + MAP_W} y2={MAP_PAD} stroke="rgba(79,142,247,0.06)" strokeWidth="18" />
      {/* Grid */}
      {[1, 2].map(i => (
        <g key={i}>
          <line x1={MAP_PAD + (MAP_W / 3) * i} y1={MAP_PAD} x2={MAP_PAD + (MAP_W / 3) * i} y2={MAP_PAD + MAP_H} stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
          <line x1={MAP_PAD} y1={MAP_PAD + (MAP_H / 3) * i} x2={MAP_PAD + MAP_W} y2={MAP_PAD + (MAP_H / 3) * i} stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
        </g>
      ))}
      {/* Movement path */}
      {self && (
        <path
          d={`M ${pathStartX} ${pathStartY} Q ${(pathStartX + selfPx) / 2} ${(pathStartY + selfPy) / 2 + 20} ${selfPx} ${selfPy}`}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" strokeDasharray="4 3"
        />
      )}
      {/* Wards, allies, enemies, self */}
      {game.wards.map((w, i) => <WardDot key={i} ward={w} />)}
      {game.participants.filter(p => p.team === 'enemy').map(p => <ChampDot key={p.id} participant={p} patch={patch} size={26} />)}
      {game.participants.filter(p => p.team === 'ally' && !p.isSelf).map(p => <ChampDot key={p.id} participant={p} patch={patch} size={26} />)}
      {game.participants.filter(p => p.isSelf).map(p => <ChampDot key={p.id} participant={p} patch={patch} size={30} />)}
      {/* Snapshot label */}
      {snapshotTs ? (
        <text x="12" y={SVG_H - 10} fontFamily="monospace" fontSize="8" fill="#4f8ef7">Snapshot at {snapshotTs}</text>
      ) : (
        <text x="12" y={SVG_H - 10} fontFamily="monospace" fontSize="8" fill="rgba(255,255,255,0.2)">Full game view</text>
      )}
      {/* Legend */}
      <circle cx={SVG_W - 120} cy={SVG_H - 8} r="3.5" fill="none" stroke="#ffffff" strokeWidth="1.5" />
      <text x={SVG_W - 115} y={SVG_H - 5} fontFamily="monospace" fontSize="7" fill="rgba(255,255,255,0.3)">You</text>
      <circle cx={SVG_W - 88} cy={SVG_H - 8} r="3.5" fill="none" stroke="#4f8ef7" strokeWidth="1.5" />
      <text x={SVG_W - 83} y={SVG_H - 5} fontFamily="monospace" fontSize="7" fill="rgba(255,255,255,0.3)">Allies</text>
      <circle cx={SVG_W - 50} cy={SVG_H - 8} r="3.5" fill="none" stroke="#E24B4A" strokeWidth="1.5" />
      <text x={SVG_W - 45} y={SVG_H - 5} fontFamily="monospace" fontSize="7" fill="rgba(255,255,255,0.3)">Enemies</text>
    </svg>
  );
}

// ─── PAGE ────────────────────────────────────────────────────
export default function DrillDownPage() {
  const router = useRouter();
  const [patch, setPatch]                 = useState(PATCH_FALLBACK);
  const [riotId, setRiotId]               = useState('Playername#NA1');
  const [activeGameIdx, setActiveGameIdx] = useState(0);
  const [activeTab, setActiveTab]         = useState(0);
  const [snapshot, setSnapshot]           = useState(null);
  const [snapshotTs, setSnapshotTs]       = useState('');

  // ── Load data ──────────────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem('atlas_riot_id');
    if (stored) setRiotId(stored);

    fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      .then(r => r.json())
      .then(v => setPatch(v[0]))
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const gameParam = params.get('game');
    const tsParam   = params.get('ts');
    if (gameParam) {
      const idx = MOCK_GAMES.findIndex(g => g.gameNum === parseInt(gameParam));
      if (idx !== -1) setActiveGameIdx(idx);
    }
    if (tsParam) {
      setTimeout(() => openSnapshot(tsParam, gameParam ? parseInt(gameParam) - 1 : 0), 0);
    }
  }, []);

  const game = MOCK_GAMES[activeGameIdx];

  function switchGame(idx) {
    setActiveGameIdx(idx);
    setSnapshot(null);
    setSnapshotTs('');
    setActiveTab(0);
  }

  function openSnapshot(ts, gameIdx = activeGameIdx) {
    const g = MOCK_GAMES[gameIdx];
    for (const tabKey of TAB_KEYS) {
      const card = g.tabs[tabKey]?.find(c => c.timestamp === ts);
      if (card) {
        setSnapshot(card.snapshot);
        setSnapshotTs(ts);
        setActiveTab(TAB_KEYS.indexOf(tabKey));
        return;
      }
    }

    load();
    return () => { cancelled = true; };
  }, [searchParams]);

  // ── Snapshot interaction ───────────────────────────────────
  const openSnapshot = useCallback((ts) => {
    if (!game) return;
    const snap = game.snapshots?.[ts];
    if (snap) {
      setSnapshot(snap);
      setSnapshotTs(ts);
    }
  }, [game]);

  function handleCardClick(card) {
    if (snapshotTs === card.timestamp) {
      setSnapshot(null);
      setSnapshotTs('');
    } else {
      openSnapshot(card.timestamp);
    }
  }

  const currentCards = game.tabs[TAB_KEYS[activeTab]] || [];

  return (
    <div className={styles.page}>
      <Nav riotId={riotId} />

      <main className={styles.main}>

        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <button className={styles.breadcrumbBack} onClick={() => router.push('/report')} type="button">
            ← Pattern report
          </button>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>
            Game {game.gameNum} · {game.champion} · {game.duration}
          </span>
        </div>

        {/* ── GAME SELECTOR TABS ── */}
        <div className={styles.gameTabs}>
          <div className={styles.gameTabsLabel}>Games analyzed</div>
          <div className={styles.gameTabsList}>
            {MOCK_GAMES.map((g, idx) => (
              <button
                key={g.gameNum}
                className={`${styles.gameTab} ${activeGameIdx === idx ? styles.gameTabActive : ''}`}
                onClick={() => switchGame(idx)}
                type="button"
              >
                <div className={styles.gameTabInner}>
                  <div className={`${styles.gameTabPortrait} ${activeGameIdx === idx ? styles.gameTabPortraitActive : ''}`}>
                    <img
                      src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${getDDragonName(g.champion)}.png`}
                      alt={g.champion}
                      width={28}
                      height={28}
                      className={styles.gameTabImg}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  </div>
                  <div className={styles.gameTabInfo}>
                    <span className={styles.gameTabNum}>Game {g.gameNum}</span>
                    <span className={styles.gameTabChamp}>{g.champion}</span>
                  </div>
                  {g.hasPattern && (
                    <div className={styles.gameTabPatternDot} title="Pattern detected in this game" />
                  )}
                </div>
                <div className={`${styles.gameTabResultBar} ${g.result === 'Win' ? styles.barWin : styles.barLoss}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowText}>Individual replay</span>
            </div>
            <h1 className={styles.heading}>
              Game {game.gameNum} — {game.champion}
              <span className={`${styles.resultBadge} ${game.result === 'Win' ? styles.badgeWin : styles.badgeLoss}`}>
                {game.result}
              </span>
              {game.hasPattern && (
                <span className={styles.patternBadge}>⚠ Pattern detected</span>
              )}
            </h1>
            <p className={styles.meta}>
              {game.queue} &nbsp;·&nbsp; <span>{game.duration}</span> &nbsp;·&nbsp; ADC &nbsp;·&nbsp; <span>{game.matchId}</span>
            </p>
          </div>

          {/* Prev / Next */}
          <div className={styles.gameNav}>
            <button
              className={styles.gameNavBtn}
              onClick={() => switchGame(Math.max(0, activeGameIdx - 1))}
              disabled={activeGameIdx === 0}
              type="button"
              aria-label="Previous game"
            >←</button>
            <span className={styles.gameNavLabel}>{activeGameIdx + 1} / {MOCK_GAMES.length}</span>
            <button
              className={styles.gameNavBtn}
              onClick={() => switchGame(Math.min(MOCK_GAMES.length - 1, activeGameIdx + 1))}
              disabled={activeGameIdx === MOCK_GAMES.length - 1}
              type="button"
              aria-label="Next game"
            >→</button>
          </div>
        </div>

        {/* Why banner */}
        {game.hasPattern && game.whyHere && (
          <div className={styles.whyBanner}>
            <div className={styles.whyDot} />
            <div className={styles.whyContent}>
              <span className={styles.whyTitle}>Why you&apos;re here:&nbsp;</span>
              <span className={styles.whyDesc}>{game.whyHere.pattern} — {game.whyHere.desc}</span>
            </div>
            <button
              className={styles.whyLink}
              onClick={() => openSnapshot(game.whyHere.timestamp)}
              type="button"
            >
              ▶ {game.whyHere.timestamp}
            </button>
          </div>
        )}

        {/* Main grid */}
        <div className={styles.mainGrid}>
          <div className={styles.mapBlock}>
            <div className={styles.mapLabel}>
              Spatial view — Game {game.gameNum} · {game.champion} · {game.result}
            </div>
            <div className={styles.mapCanvas}>
              <GameMap game={game} patch={patch} snapshotTs={snapshotTs} />
            </div>
          </div>

          <div className={styles.statsBlock}>
            <span className={styles.blockLabel}>Game stats</span>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>KDA</span>
                <span className={`${styles.statVal} ${game.result === 'Loss' ? styles.colorRed : styles.colorBlue}`}>{game.kda}</span>
                <span className={styles.statSub}>{game.result === 'Win' ? 'above avg' : 'below avg'}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>CS</span>
                <span className={styles.statVal}>{game.cs}</span>
                <span className={styles.statSub}>{game.csPerMin}/min</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Vision</span>
                <span className={`${styles.statVal} ${game.vision < 20 ? styles.colorAmber : ''}`}>{game.vision}</span>
                <span className={styles.statSub}>score</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Duration</span>
                <span className={styles.statVal}>{game.duration}</span>
                <span className={styles.statSub}>ranked solo</span>
              </div>
            </div>

            <span className={styles.blockLabel} style={{ marginTop: '4px' }}>Phase performance</span>
            <div className={styles.phases}>
              {game.phases.map(p => (
                <div key={p.label} className={styles.phaseRow}>
                  <span className={styles.phaseName}>{p.label}</span>
                  <div className={styles.phaseTrack}>
                    <div className={`${styles.phaseFill} ${styles[`color_${p.color}`]}`} style={{ width: `${p.pct}%` }} />
                  </div>
                  <span className={styles.phasePct}>{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Snapshot panel */}
        {snapshot && (
          <div className={styles.snapshotPanel}>
            <div className={styles.snapshotHeader}>
              <span className={styles.snapshotTitle}>Snapshot — {snapshotTs}</span>
              <button
                className={styles.snapshotClose}
                onClick={() => { setSnapshot(null); setSnapshotTs(''); }}
                type="button"
              >✕</button>
            </div>
            <p className={styles.snapshotText}>
              {currentCards.find(c => c.timestamp === snapshotTs)?.text
                || 'No additional context for this timestamp.'}
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs}>
          {TAB_LABELS.map((label, idx) => (
            <button
              key={label}
              className={`${styles.tab} ${activeTab === idx ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(idx)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Insight cards */}
        <div className={styles.cardGrid}>
          {currentCards.map((card, idx) => (
            <div
              key={idx}
              className={`${styles.insightCard} ${card.highlighted ? styles.cardHighlighted : ''} ${snapshotTs === card.timestamp ? styles.cardActive : ''}`}
              onClick={() => handleCardClick(card)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleCardClick(card)}
            >
              <span className={styles.cardTitle}>{card.title}</span>
              <span className={styles.cardText}>{card.text}</span>
              <span className={styles.cardLink}>▶ Snapshot at {card.timestamp}</span>
            </div>
          ))}
        </div>

        <button className={styles.btnBack} onClick={() => router.push('/report')} type="button">
          ← Back to pattern report
        </button>

      </main>

      <footer className={styles.footer}>
        <p>atlas.gg &mdash; spatial replay analysis &mdash; stormforge 2026 &mdash; not endorsed by riot games</p>
      </footer>
    </div>
  );
}
