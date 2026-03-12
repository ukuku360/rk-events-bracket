import type { HTMLAttributes, PointerEvent, MouseEvent, SVGProps } from 'react';
import { useCallback, useRef, useState } from 'react';
import {
  PROFILE_CARD_GAP,
  PROFILE_CARD_MARGIN,
} from '../constants';
import type { ProfileCardData } from '../types';

interface CardPositionOptions {
  anchorRect?: DOMRect | null;
  clientX?: number;
  clientY?: number;
  pinned?: boolean;
}

interface ProfileCardState {
  data: ProfileCardData | null;
  visible: boolean;
  pinned: boolean;
  left: number;
  top: number;
}

interface HandlerOptions {
  enablePin?: boolean;
  releasePinnedOnHover?: boolean;
}

export type ProfileHandlerFactory = (
  data: ProfileCardData | null,
  options?: HandlerOptions,
) => HTMLAttributes<HTMLElement> | SVGProps<SVGGElement>;

const INITIAL_STATE: ProfileCardState = {
  data: null,
  visible: false,
  pinned: false,
  left: PROFILE_CARD_MARGIN,
  top: PROFILE_CARD_MARGIN,
};

export function useProfileCard() {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [card, setCard] = useState<ProfileCardState>(INITIAL_STATE);

  const getCardPosition = useCallback((options: CardPositionOptions = {}) => {
    const {
      anchorRect = null,
      clientX,
      clientY,
      pinned = false,
    } = options;

    const cardRect = cardRef.current?.getBoundingClientRect();
    const fallbackX = clientX ?? window.innerWidth / 2;
    const fallbackY = clientY ?? window.innerHeight / 2;

    const sourceRect = anchorRect || {
      left: fallbackX,
      right: fallbackX,
      top: fallbackY,
      bottom: fallbackY,
    };

    const gap = pinned ? PROFILE_CARD_GAP + 4 : PROFILE_CARD_GAP;
    const width = cardRect?.width ?? 300;
    const height = cardRect?.height ?? 220;

    let left = typeof clientX === 'number' ? clientX + gap : sourceRect.right + gap;
    let top = typeof clientY === 'number' ? clientY + gap : sourceRect.top;

    if (left + width > window.innerWidth - PROFILE_CARD_MARGIN) {
      left = sourceRect.left - width - gap;
    }

    if (left < PROFILE_CARD_MARGIN) {
      left = Math.max(PROFILE_CARD_MARGIN, window.innerWidth - width - PROFILE_CARD_MARGIN);
    }

    if (top + height > window.innerHeight - PROFILE_CARD_MARGIN) {
      top = Math.max(PROFILE_CARD_MARGIN, sourceRect.bottom - height);
    }

    if (top < PROFILE_CARD_MARGIN) {
      top = PROFILE_CARD_MARGIN;
    }

    return { left, top };
  }, []);

  const showProfileCard = useCallback(
    (data: ProfileCardData | null, options: CardPositionOptions = {}) => {
      if (!data) {
        return;
      }

      const nextPosition = getCardPosition(options);

      setCard({
        data,
        visible: true,
        pinned: Boolean(options.pinned),
        left: nextPosition.left,
        top: nextPosition.top,
      });
    },
    [getCardPosition],
  );

  const hideProfileCard = useCallback((force = false) => {
    setCard((current) => {
      if (current.pinned && !force) {
        return current;
      }

      return {
        ...INITIAL_STATE,
        left: current.left,
        top: current.top,
      };
    });
  }, []);

  const getProfileHandlers = useCallback(
    (
      data: ProfileCardData | null,
      options: HandlerOptions = {},
    ) => {
      if (!data) {
        return {};
      }

      const { enablePin = false, releasePinnedOnHover = false } = options;

      return {
        onPointerEnter: (event: PointerEvent<HTMLElement | SVGElement>) => {
          if (event.pointerType === 'touch') {
            return;
          }

          if (card.pinned) {
            if (!releasePinnedOnHover) {
              return;
            }

            hideProfileCard(true);
          }

          showProfileCard(data, {
            clientX: event.clientX,
            clientY: event.clientY,
          });
        },
        onPointerMove: (event: PointerEvent<HTMLElement | SVGElement>) => {
          if (event.pointerType === 'touch' || card.pinned) {
            return;
          }

          showProfileCard(data, {
            clientX: event.clientX,
            clientY: event.clientY,
          });
        },
        onPointerLeave: () => {
          if (!card.pinned && card.data?.key === data.key) {
            hideProfileCard(false);
          }
        },
        onClick: enablePin
          ? (event: MouseEvent<HTMLElement | SVGGElement>) => {
              event.stopPropagation();

              const isSameCard = card.pinned && card.data?.key === data.key;
              if (isSameCard) {
                hideProfileCard(true);
                return;
              }

              showProfileCard(data, {
                pinned: true,
                anchorRect: event.currentTarget.getBoundingClientRect(),
                clientX: event.clientX,
                clientY: event.clientY,
              });
            }
          : undefined,
      };
    },
    [card.data?.key, card.pinned, hideProfileCard, showProfileCard],
  );

  return {
    card,
    cardRef,
    hideProfileCard,
    getProfileHandlers,
  };
}
