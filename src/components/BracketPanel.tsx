import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import {
  BOTTOM_PADDING,
  MAX_PLAYERS,
  NODE_HEIGHT,
  NODE_WIDTH,
  ROW_GAP,
  SLOT_GAP,
  THIRD_PLACE_KEY,
  THIRD_PLACE_PANEL_GAP,
  THIRD_PLACE_PANEL_WIDTH,
  TOP_PADDING,
  X_PADDING,
} from '../constants';
import type { ProfileHandlerFactory } from '../hooks/useProfileCard';
import type {
  MatchWinners,
  PlayerRecord,
  RosterEntry,
} from '../types';
import {
  createEmptyBracketEntrant,
  getBracketEntrants,
  getFourthPlaceIndex,
  getMatchParticipantIndexes,
  getResolvedMatchWinner,
  getThirdPlaceEntrantIndexes,
} from '../utils/bracket';
import { makeProfileCardData } from '../utils/profile';
import { shortenPlayerName, shortenText } from '../utils/text';

interface BracketPanelProps {
  players: PlayerRecord[];
  rosterOrder: RosterEntry[];
  matchWinners: MatchWinners;
  isRosterFinalized: boolean;
  isShufflingRoster: boolean;
  canUseRosterControls: boolean;
  rosterStatus: string;
  isBracketFocus: boolean;
  getProfileHandlers: ProfileHandlerFactory;
  onDrawRoster: () => void;
  onToggleFocus: () => void;
  onSelectWinner: (
    childLevel: number,
    childMatchIndex: number,
    winnerEntrantIndex: number,
    clientX?: number,
    clientY?: number,
  ) => void;
  onSelectThirdPlaceWinner: (
    winnerEntrantIndex: number,
    clientX?: number,
    clientY?: number,
  ) => void;
  onScroll: () => void;
}

interface Connector {
  d: string;
  className: string;
}

interface RenderNode {
  key: string;
  x: number;
  y: number;
  textPrimary: string;
  textMeta: string;
  isLeaf: boolean;
  isEmpty: boolean;
  className: string;
  profileData: ReturnType<typeof makeProfileCardData>;
  action?:
    | {
        kind: 'winner';
        childLevel: number;
        childMatchIndex: number;
        winnerEntrantIndex: number;
      }
    | {
        kind: 'third-place';
        winnerEntrantIndex: number;
      };
}

interface PlacementPanelData {
  x: number;
  y: number;
  width: number;
  height: number;
  playoffReady: boolean;
  canControl: boolean;
}

function buildConnectorPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  className = 'line',
): Connector {
  const x1 = from.x;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y - NODE_HEIGHT / 2;
  const midY = (y1 + y2) / 2;

  return {
    d: `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`,
    className,
  };
}

export function BracketPanel({
  players,
  rosterOrder,
  matchWinners,
  isRosterFinalized,
  isShufflingRoster,
  canUseRosterControls,
  rosterStatus,
  isBracketFocus,
  getProfileHandlers,
  onDrawRoster,
  onToggleFocus,
  onSelectWinner,
  onSelectThirdPlaceWinner,
  onScroll,
}: BracketPanelProps) {
  const {
    connectors,
    nodes,
    placementPanel,
    svgHeight,
    svgWidth,
  } = useMemo(() => {
    const sourceEntrants = getBracketEntrants(players, rosterOrder, isRosterFinalized);
    const entrants = [...sourceEntrants];

    while (entrants.length < MAX_PLAYERS) {
      entrants.push(createEmptyBracketEntrant());
    }

    const rounds = [16, 8, 4, 2, 1];
    const levelNodes: Array<Array<{ x: number; y: number; isLeaf: boolean; isEmpty: boolean; name?: string; aura?: string; weak?: string }>> = [];
    const nextConnectors: Connector[] = [];
    const nextNodes: RenderNode[] = [];
    const canControl = isRosterFinalized && canUseRosterControls;
    const slotSpacing = NODE_WIDTH + SLOT_GAP;
    const baseSvgWidth = X_PADDING * 2 + slotSpacing * (MAX_PLAYERS - 1);
    const previewThirdPlaceEntrants = getThirdPlaceEntrantIndexes(entrants, matchWinners);
    const showThirdPlacePanel =
      [0, 1].some(
        (matchIndex) =>
          getMatchParticipantIndexes(3, matchIndex, entrants, matchWinners).length === 2,
      ) ||
      previewThirdPlaceEntrants.some((entrantIndex) => entrantIndex !== undefined) ||
      matchWinners[THIRD_PLACE_KEY] !== undefined;
    const resolvedSvgWidth =
      baseSvgWidth + (showThirdPlacePanel ? THIRD_PLACE_PANEL_GAP + THIRD_PLACE_PANEL_WIDTH : 0);
    const resolvedSvgHeight = TOP_PADDING + ROW_GAP * (rounds.length - 1) + BOTTOM_PADDING;
    const yBottom = TOP_PADDING + ROW_GAP * (rounds.length - 1);

    levelNodes[0] = entrants.slice(0, 16).map((player, index) => ({
      x: X_PADDING + slotSpacing * index,
      y: yBottom,
      name: player.empty ? 'BYE' : `${index + 1}. ${shortenPlayerName(player.name, 12)}`,
      aura: player.aura,
      weak: player.weak,
      isLeaf: true,
      isEmpty: Boolean(player.empty),
    }));

    for (let levelIndex = 1; levelIndex < rounds.length; levelIndex += 1) {
      const previousLevel = levelNodes[levelIndex - 1];
      const count = rounds[levelIndex];
      const currentLevel = [];

      for (let index = 0; index < count; index += 1) {
        const leftNode = previousLevel[index * 2];
        const rightNode = previousLevel[index * 2 + 1];

        currentLevel.push({
          x: (leftNode.x + rightNode.x) / 2,
          y: yBottom - ROW_GAP * levelIndex,
          isLeaf: false,
          isEmpty: leftNode.isEmpty && rightNode.isEmpty,
        });
      }

      levelNodes[levelIndex] = currentLevel;
    }

    for (let levelIndex = rounds.length - 1; levelIndex > 0; levelIndex -= 1) {
      const currentLevel = levelNodes[levelIndex];
      const previousLevel = levelNodes[levelIndex - 1];

      currentLevel.forEach((node, index) => {
        const leftNode = previousLevel[index * 2];
        const rightNode = previousLevel[index * 2 + 1];
        nextConnectors.push(buildConnectorPath(leftNode, node));
        nextConnectors.push(buildConnectorPath(rightNode, node));
      });
    }

    levelNodes.forEach((level, levelIndex) => {
      level.forEach((node, nodeIndex) => {
        let textPrimary = '';
        let textMeta = '';
        let isWinnerNode = false;
        let isLoserNode = false;
        let isChampionNode = false;
        let profileData: ReturnType<typeof makeProfileCardData> = null;
        let action: RenderNode['action'];

        if (node.isLeaf) {
          textPrimary = node.name || '';
          textMeta = !node.isEmpty
            ? `${shortenText(node.aura, 12)} / ${shortenText(node.weak, 12)}`
            : '';
          profileData = makeProfileCardData(entrants[nodeIndex], `Slot ${nodeIndex + 1}`);

          if (!node.isEmpty && isRosterFinalized) {
            const parentWinner = getResolvedMatchWinner(
              1,
              Math.floor(nodeIndex / 2),
              entrants,
              matchWinners,
            );

            if (parentWinner === nodeIndex) {
              isWinnerNode = true;
            } else if (parentWinner !== undefined) {
              isLoserNode = true;
            }

            if (canControl) {
              action = {
                kind: 'winner',
                childLevel: 0,
                childMatchIndex: nodeIndex,
                winnerEntrantIndex: nodeIndex,
              };
            }
          }
        } else if (levelIndex === 4) {
          const championIndex = getResolvedMatchWinner(4, 0, entrants, matchWinners);

          if (championIndex !== undefined) {
            const champion = entrants[championIndex];

            if (champion && !champion.empty) {
              textPrimary = shortenPlayerName(champion.name, 12);
              isChampionNode = true;
              profileData = makeProfileCardData(champion, 'Champion');
            } else {
              textPrimary = 'Champion';
            }
          } else {
            textPrimary = 'Champion';
          }
        } else {
          const winnerIndex = getResolvedMatchWinner(levelIndex, nodeIndex, entrants, matchWinners);

          if (winnerIndex !== undefined) {
            const winner = entrants[winnerIndex];
            textPrimary = winner && !winner.empty ? shortenPlayerName(winner.name, 12) : '?';
            profileData = makeProfileCardData(
              winner,
              levelIndex === 1
                ? 'Round 1 Winner'
                : levelIndex === 2
                  ? 'Quarterfinal Winner'
                  : 'Finalist',
            );

            const parentWinner = getResolvedMatchWinner(
              levelIndex + 1,
              Math.floor(nodeIndex / 2),
              entrants,
              matchWinners,
            );

            if (parentWinner === winnerIndex) {
              isWinnerNode = true;
            } else if (parentWinner !== undefined) {
              isLoserNode = true;
            }

            if (canControl) {
              action = {
                kind: 'winner',
                childLevel: levelIndex,
                childMatchIndex: nodeIndex,
                winnerEntrantIndex: winnerIndex,
              };
            }
          } else {
            textPrimary = '?';
          }
        }

        const classNames = [
          action ? 'node-clickable' : '',
          isWinnerNode ? 'node-winner' : '',
          isLoserNode ? 'node-loser' : '',
          isChampionNode ? 'node-champion' : '',
          profileData ? 'node-profileable' : '',
        ]
          .filter(Boolean)
          .join(' ');

        nextNodes.push({
          key: `${levelIndex}-${nodeIndex}`,
          x: node.x,
          y: node.y,
          textPrimary,
          textMeta,
          isLeaf: node.isLeaf,
          isEmpty: node.isEmpty,
          className: classNames,
          profileData,
          action,
        });
      });
    });

    let nextPlacementPanel: PlacementPanelData | null = null;

    if (showThirdPlacePanel) {
      const thirdPlacePanelX = baseSvgWidth + THIRD_PLACE_PANEL_GAP;
      const thirdPlacePanelY = TOP_PADDING + 12;
      const thirdPlacePanelHeight = resolvedSvgHeight - thirdPlacePanelY - (BOTTOM_PADDING - 8);
      const thirdPlaceCenterX = thirdPlacePanelX + THIRD_PLACE_PANEL_WIDTH / 2;
      const thirdPlaceWinnerNode = { x: thirdPlaceCenterX, y: thirdPlacePanelY + 128 };
      const thirdPlaceLoserNodes = [
        { x: thirdPlacePanelX + 106, y: thirdPlacePanelY + 286 },
        { x: thirdPlacePanelX + THIRD_PLACE_PANEL_WIDTH - 106, y: thirdPlacePanelY + 286 },
      ];
      const fourthPlaceNode = { x: thirdPlaceCenterX, y: thirdPlacePanelY + 418 };
      const thirdPlaceEntrants = previewThirdPlaceEntrants;
      const playoffReady = thirdPlaceEntrants.every((entrantIndex) => entrantIndex !== undefined);
      const rawThirdPlaceWinnerIndex = matchWinners[THIRD_PLACE_KEY];
      const thirdPlaceWinnerIndex = thirdPlaceEntrants.includes(rawThirdPlaceWinnerIndex)
        ? rawThirdPlaceWinnerIndex
        : undefined;
      const fourthPlaceIndex = getFourthPlaceIndex(thirdPlaceWinnerIndex, entrants, matchWinners);

      nextPlacementPanel = {
        x: thirdPlacePanelX,
        y: thirdPlacePanelY,
        width: THIRD_PLACE_PANEL_WIDTH,
        height: thirdPlacePanelHeight,
        playoffReady,
        canControl,
      };

      thirdPlaceLoserNodes.forEach((childNode) => {
        nextConnectors.push(buildConnectorPath(childNode, thirdPlaceWinnerNode, 'placement-line'));
      });

      thirdPlaceLoserNodes.forEach((childNode, index) => {
        const entrantIndex = thirdPlaceEntrants[index];
        const player = entrantIndex !== undefined ? entrants[entrantIndex] : null;
        const canSelect = Boolean(
          canControl && playoffReady && entrantIndex !== undefined && player && !player.empty,
        );
        const classNames = [
          canSelect ? 'node-clickable' : '',
          entrantIndex !== undefined && thirdPlaceWinnerIndex === entrantIndex ? 'node-winner' : '',
          thirdPlaceWinnerIndex !== undefined &&
          entrantIndex !== undefined &&
          thirdPlaceWinnerIndex !== entrantIndex
            ? 'node-loser'
            : '',
          player ? 'node-profileable' : '',
        ]
          .filter(Boolean)
          .join(' ');

        nextNodes.push({
          key: `third-loser-${index}`,
          x: childNode.x,
          y: childNode.y,
          textPrimary:
            player && !player.empty ? shortenPlayerName(player.name, 12) : 'Semifinal loser',
          textMeta: entrantIndex !== undefined ? `Semi ${index + 1} loser` : 'Pending semifinal',
          isLeaf: false,
          isEmpty: entrantIndex === undefined,
          className: classNames,
          profileData: makeProfileCardData(player, `Semifinal ${index + 1} Loser`),
          action:
            canSelect && entrantIndex !== undefined
              ? {
                  kind: 'third-place',
                  winnerEntrantIndex: entrantIndex,
                }
              : undefined,
        });
      });

      {
        const player = thirdPlaceWinnerIndex !== undefined ? entrants[thirdPlaceWinnerIndex] : null;
        nextNodes.push({
          key: 'third-place-winner',
          x: thirdPlaceWinnerNode.x,
          y: thirdPlaceWinnerNode.y,
          textPrimary:
            player && !player.empty ? shortenPlayerName(player.name, 12) : '3rd Place',
          textMeta:
            thirdPlaceWinnerIndex !== undefined
              ? '3rd Place Winner'
              : playoffReady
                ? 'Playoff pending'
                : 'Waiting for semifinals',
          isLeaf: false,
          isEmpty: thirdPlaceWinnerIndex === undefined,
          className: ['node-third-place', player ? 'node-profileable' : ''].filter(Boolean).join(' '),
          profileData: makeProfileCardData(player, '3rd Place'),
        });
      }

      {
        const player = fourthPlaceIndex !== undefined ? entrants[fourthPlaceIndex] : null;
        nextNodes.push({
          key: 'fourth-place',
          x: fourthPlaceNode.x,
          y: fourthPlaceNode.y,
          textPrimary: player && !player.empty ? shortenPlayerName(player.name, 12) : '4th Place',
          textMeta:
            fourthPlaceIndex !== undefined
              ? '3rd Place Playoff Loser'
              : playoffReady
                ? 'Decided after playoff'
                : 'Waiting for semifinals',
          isLeaf: false,
          isEmpty: fourthPlaceIndex === undefined,
          className: ['node-fourth-place', player ? 'node-profileable' : ''].filter(Boolean).join(' '),
          profileData: makeProfileCardData(player, '4th Place'),
        });
      }
    }

    return {
      connectors: nextConnectors,
      nodes: nextNodes,
      placementPanel: nextPlacementPanel,
      svgWidth: resolvedSvgWidth,
      svgHeight: resolvedSvgHeight,
    };
  }, [canUseRosterControls, isRosterFinalized, matchWinners, players, rosterOrder]);

  const drawButtonDisabled = !canUseRosterControls || isShufflingRoster || players.length < 2;
  const drawButtonText = isShufflingRoster ? 'Drawing...' : 'Draw Roster';

  return (
    <section className="panel bracket-panel">
      <div className="bracket-header">
        <div>
          <h2 className="bracket-title">Bracket (16 Entrant Layout)</h2>
          <p className="roster-status">{rosterStatus}</p>
        </div>
        <div className="bracket-controls">
          <button
            type="button"
            className="draw-toggle"
            aria-live="polite"
            disabled={drawButtonDisabled}
            onClick={onDrawRoster}
          >
            {drawButtonText}
          </button>
          <button
            type="button"
            className="focus-toggle"
            aria-pressed={isBracketFocus}
            onClick={onToggleFocus}
          >
            {isBracketFocus ? 'Back to normal view' : 'Enlarge Bracket'}
          </button>
        </div>
      </div>
      <div className="bracket-shell" onScroll={onScroll}>
        <div className={`shuffle-overlay${isShufflingRoster ? ' visible' : ''}`} aria-hidden={!isShufflingRoster}>
          <div className="shuffle-orbit"></div>
          <div className="shuffle-text">Drawing roster...</div>
          <p className="shuffle-subtext">
            Players are being randomized and the final bracket will be locked.
          </p>
        </div>
        <svg
          id="bracketSvg"
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={svgWidth}
          height={svgHeight}
          role="img"
          aria-label="Bracket diagram"
          preserveAspectRatio="xMinYMin meet"
        >
          <g id="edges">
            {connectors.map((connector, index) => (
              <path
                key={`${connector.className}-${index}`}
                d={connector.d}
                className={connector.className}
              />
            ))}
            {placementPanel ? (
              <>
                <rect
                  x={placementPanel.x}
                  y={placementPanel.y}
                  width={placementPanel.width}
                  height={placementPanel.height}
                  rx={24}
                  className="placement-panel"
                />
                <text
                  x={placementPanel.x + 24}
                  y={placementPanel.y + 42}
                  className="placement-panel-title"
                >
                  3RD PLACE PLAYOFF
                </text>
                <text
                  x={placementPanel.x + 24}
                  y={placementPanel.y + 68}
                  className="placement-panel-note"
                >
                  {placementPanel.playoffReady
                    ? 'SEMIFINAL LOSERS DROP HERE.'
                    : 'OPENS ONCE BOTH SEMIFINALS ARE LOCKED.'}
                </text>
                <text
                  x={placementPanel.x + 24}
                  y={placementPanel.y + 88}
                  className="placement-panel-note"
                >
                  {placementPanel.playoffReady
                    ? placementPanel.canControl
                      ? 'CLICK A PLAYER TO LOCK 3RD PLACE.'
                      : 'ADMIN LOCKS 3RD PLACE FROM THIS PANEL.'
                    : 'LOSERS AUTO-DROP IN AS THE SEMIS FINISH.'}
                </text>
              </>
            ) : null}
          </g>
          <g id="nodes">
            {nodes.map((node) => {
              const profileHandlers = getProfileHandlers(node.profileData, {
                enablePin: !node.action,
              }) as ComponentProps<'g'>;
              const { onClick: profileOnClick, ...restProfileHandlers } = profileHandlers;

              return (
                <g
                  key={node.key}
                  className={node.className}
                  {...restProfileHandlers}
                  onClick={(event) => {
                    if (!node.action) {
                      profileOnClick?.(event);
                      return;
                    }

                    if (node.action.kind === 'winner') {
                      onSelectWinner(
                        node.action.childLevel,
                        node.action.childMatchIndex,
                        node.action.winnerEntrantIndex,
                        event.clientX,
                        event.clientY,
                      );
                      return;
                    }

                    onSelectThirdPlaceWinner(
                      node.action.winnerEntrantIndex,
                      event.clientX,
                      event.clientY,
                    );
                  }}
                >
                  <rect
                    x={node.x - NODE_WIDTH / 2}
                    y={node.y - NODE_HEIGHT / 2}
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={10}
                    className={`node-rect${node.isLeaf && node.isEmpty ? ' node-placeholder' : ''}`}
                  />
                  <text className="node-text" x={node.x} y={node.y - 2}>
                    {node.textPrimary}
                  </text>
                  {node.textMeta ? (
                    <text className="node-meta" x={node.x} y={node.y + 13}>
                      {node.textMeta}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </section>
  );
}
