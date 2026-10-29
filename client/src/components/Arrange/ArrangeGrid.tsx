import {
  Announcements,
  closestCenter,
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  ScreenReaderInstructions,
  TouchSensor,
  UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  SortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { App, Category } from '../../interfaces';
import { State } from '../../store/reducers';
import { iconParser, isImage, isSvg, isUrl, urlParser } from '../../utility';
import { categoryItems, Item, ItemsKey } from '../../utility/moveItem';
import { WIDE_CATEGORY_MIN_APPS } from '../Apps/AppCard/AppCard';
import appCardClasses from '../Apps/AppCard/AppCard.module.css';
import appGridClasses from '../Apps/AppGrid/AppGrid.module.css';
import bookmarkCardClasses from '../Bookmarks/BookmarkCard/BookmarkCard.module.css';
import bookmarkGridClasses from '../Bookmarks/BookmarkGrid/BookmarkGrid.module.css';
import { Icon, SvgIcon } from '../UI';
import classes from './ArrangeGrid.module.css';

interface Props {
  kind: ItemsKey;
  categories: Category[];
  /** Resolves once the move is saved; dragging is paused until then */
  onMove: (
    itemId: number,
    toCategoryId: number,
    toIndex: number
  ) => Promise<unknown> | void;
  onEdit: (item: Item) => void;
}

type Containers = Record<string, number[]>;

const containerId = (categoryId: number) => `category-${categoryId}`;

// Without custom ordering items can only change category, so they stay put
// while the target category lights up
const keepInPlace: SortingStrategy = () => null;

const ItemIcon = ({ item, kind }: { item: Item; kind: ItemsKey }) => {
  if (!item.icon) return null;

  const css = kind === 'apps' ? appCardClasses : bookmarkCardClasses;
  const wrapperClass = kind === 'apps' ? css.AppIcon : css.BookmarkIcon;
  const svgClass = kind === 'apps' ? css.AppIconSvg : css.BookmarkIconSvg;
  const { icon, name } = item;
  const source = isUrl(icon) ? icon : `/uploads/${icon}`;

  return (
    <div className={wrapperClass}>
      {isImage(icon) ? (
        <img
          src={source}
          alt={`${name} icon`}
          className={css.CustomIcon}
          draggable={false}
        />
      ) : isSvg(icon) ? (
        <SvgIcon
          src={source}
          alt={`${name} icon`}
          fill="var(--color-primary)"
          className={svgClass}
        />
      ) : (
        <Icon icon={iconParser(icon)} />
      )}
    </div>
  );
};

const TileContent = ({ item, kind }: { item: Item; kind: ItemsKey }) => {
  const config = useSelector((state: State) => state.config.config);

  return (
    <>
      <ItemIcon item={item} kind={kind} />
      {kind === 'apps' ? (
        <div className={`${appCardClasses.AppCardDetails} ${classes.Details}`}>
          <h5>{item.name}</h5>
          <span>
            {(item as App).description ||
              urlParser(item.url, config.extraUrlSchemes)[0]}
          </span>
        </div>
      ) : (
        <span className={classes.Details}>{item.name}</span>
      )}
      {!item.isPublic && (
        <span className={classes.Hidden} title="Hidden from guests">
          <Icon icon="mdiEyeOff" color="var(--color-accent)" />
        </span>
      )}
    </>
  );
};

interface TileProps {
  item: Item;
  kind: ItemsKey;
  disabled: boolean;
  onEdit: (item: Item) => void;
}

const SortableTile = ({ item, kind, disabled, onEdit }: TileProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });

  // Pointer and touch drags start anywhere on the tile, keyboard drags only
  // from the handle so the edit button keeps working with Enter/Space
  return (
    <div
      ref={setNodeRef}
      className={`${classes.Item} ${isDragging ? classes.Placeholder : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid={`arrange-item-${item.id}`}
      {...listeners}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={classes.Handle}
        aria-label={`Move ${item.name}`}
        title="Drag to move, or press Space and use the arrow keys"
        {...attributes}
      >
        <Icon icon="mdiDragVertical" color="var(--color-accent)" />
      </button>
      <TileContent item={item} kind={kind} />
      <button
        type="button"
        className={classes.Edit}
        aria-label={`Edit ${item.name}`}
        title="Edit"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={() => onEdit(item)}
      >
        <Icon icon="mdiPencil" />
      </button>
    </div>
  );
};

interface ColumnProps {
  category: Category;
  kind: ItemsKey;
  ids: number[];
  itemsById: Map<number, Item>;
  customOrder: boolean;
  highlighted: boolean;
  disabled: boolean;
  onEdit: (item: Item) => void;
}

const CategoryColumn = (props: ColumnProps) => {
  const {
    category,
    kind,
    ids,
    itemsById,
    customOrder,
    highlighted,
    disabled,
    onEdit,
  } = props;
  const id = containerId(category.id);
  const { setNodeRef } = useDroppable({ id, disabled });

  let cardClass = bookmarkCardClasses.BookmarkCard;
  let listClass = bookmarkCardClasses.Bookmarks;

  if (kind === 'apps') {
    const isWide = category.apps.length >= WIDE_CATEGORY_MIN_APPS;
    cardClass = isWide
      ? `${appCardClasses.AppCard} ${appCardClasses.WideAppCard}`
      : appCardClasses.AppCard;
    listClass = appCardClasses.Apps;
  }

  return (
    <div className={cardClass} data-testid={`arrange-category-${category.id}`}>
      <h3>{category.name}</h3>
      <SortableContext
        id={id}
        items={ids}
        strategy={customOrder ? rectSortingStrategy : keepInPlace}
      >
        <div
          ref={setNodeRef}
          className={`${listClass} ${classes.DropZone} ${
            highlighted ? classes.DropTarget : ''
          }`}
        >
          {ids.map((itemId) => {
            const item = itemsById.get(itemId);

            return item ? (
              <SortableTile
                key={itemId}
                item={item}
                kind={kind}
                disabled={disabled}
                onEdit={onEdit}
              />
            ) : null;
          })}
          {!ids.length && (
            <div className={classes.Empty}>
              Drop {kind === 'apps' ? 'apps' : 'bookmarks'} here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
};

/**
 * Edit-mode grid of app or bookmark categories, laid out like AppGrid and
 * BookmarkGrid, where items can be dragged to another category or, with
 * custom ordering, to another position.
 */
export const ArrangeGrid = ({
  kind,
  categories,
  onMove,
  onEdit,
}: Props): JSX.Element => {
  const useOrdering = useSelector(
    (state: State) => state.config.config.useOrdering
  );
  const customOrder = useOrdering === 'orderId';
  const noun = kind === 'apps' ? 'app' : 'bookmark';

  const base = useMemo<Containers>(
    () =>
      Object.fromEntries(
        categories.map((c) => [
          containerId(c.id),
          categoryItems(c, kind).map(({ id }) => id),
        ])
      ),
    [categories, kind]
  );

  const itemsById = useMemo(
    () =>
      new Map(
        categories.flatMap((c) =>
          categoryItems(c, kind).map((item) => [item.id, item] as const)
        )
      ),
    [categories, kind]
  );

  const categoryByContainer = useMemo(
    () => new Map(categories.map((c) => [containerId(c.id), c])),
    [categories]
  );

  // Item positions while dragging; the store is only updated on drop
  const [dragItems, setDragItems] = useState<Containers | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overContainer, setOverContainer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const movedToNewContainer = useRef(false);

  const containers = dragItems ?? base;

  const findContainer = useCallback(
    (id: UniqueIdentifier, within: Containers = containers) => {
      if (typeof id === 'string') return id in within ? id : undefined;
      return Object.keys(within).find((key) => within[key].includes(id));
    },
    [containers]
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      movedToNewContainer.current = false;
    });
  }, [containers]);

  // Prefer the item under the pointer; over a category's empty space pick
  // its closest item so the drop position follows the pointer
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerHits = pointerWithin(args);
      const hits = pointerHits.length ? pointerHits : rectIntersection(args);
      let overId = getFirstCollision(hits, 'id');

      if (overId != null) {
        if (typeof overId === 'string' && containers[overId]?.length) {
          const ids = containers[overId];
          overId =
            closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (container) => ids.includes(container.id as number)
              ),
            })[0]?.id ?? overId;
        }

        lastOverId.current = overId;
        return [{ id: overId }];
      }

      if (movedToNewContainer.current) {
        lastOverId.current = activeId;
      }

      return lastOverId.current != null ? [{ id: lastOverId.current }] : [];
    },
    [containers, activeId]
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const resetDrag = () => {
    setActiveId(null);
    setDragItems(null);
    setOverContainer(null);
    lastOverId.current = null;
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as number);
    setDragItems(base);
    setOverContainer(findContainer(active.id, base) ?? null);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;

    const overC = findContainer(over.id);
    setOverContainer(overC ?? null);

    if (!customOrder) return;

    const activeC = findContainer(active.id);
    if (!overC || !activeC || activeC === overC) return;

    setDragItems((prev) => {
      const items = prev ?? base;
      const activeItems = items[activeC];
      const overItems = items[overC];
      let newIndex = overItems.length;

      if (typeof over.id === 'number') {
        const overIndex = overItems.indexOf(over.id);
        const translated = active.rect.current.translated;
        const isBelow =
          !!translated && translated.top > over.rect.top + over.rect.height / 2;

        if (overIndex >= 0) newIndex = overIndex + (isBelow ? 1 : 0);
      }

      movedToNewContainer.current = true;

      return {
        ...items,
        [activeC]: activeItems.filter((id) => id !== active.id),
        [overC]: [
          ...overItems.slice(0, newIndex),
          active.id as number,
          ...overItems.slice(newIndex),
        ],
      };
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const items = containers;
    const itemId = active.id as number;
    const fromC = findContainer(itemId, base);
    const overC = over ? findContainer(over.id, items) : undefined;

    resetDrag();

    if (!over || !fromC || !overC) return;

    const category = categoryByContainer.get(overC);
    if (!category) return;

    let toIndex = 0;

    if (customOrder) {
      const list = items[overC];
      const from = list.indexOf(itemId);
      const to = typeof over.id === 'number' ? list.indexOf(over.id) : -1;
      const final = from >= 0 && to >= 0 ? arrayMove(list, from, to) : list;
      const index = final.indexOf(itemId);

      toIndex = index >= 0 ? index : list.length;
    } else if (overC === fromC) {
      if (typeof over.id !== 'number' || over.id === itemId) return;
      toIndex = base[fromC].indexOf(over.id);
    }

    if (overC === fromC && toIndex === base[fromC].indexOf(itemId)) return;

    const saved = onMove(itemId, category.id, toIndex);

    if (saved) {
      setSaving(true);
      Promise.resolve(saved).finally(() => setSaving(false));
    }
  };

  const nameOf = (id: UniqueIdentifier) =>
    itemsById.get(id as number)?.name ?? noun;

  const categoryOf = (id: UniqueIdentifier) => {
    const key = findContainer(id);
    return (key && categoryByContainer.get(key)?.name) || 'a category';
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)} from ${categoryOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is over ${categoryOf(over.id)}.`
        : `${nameOf(active.id)} is no longer over a category.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} was dropped in ${categoryOf(over.id)}.`
        : `${nameOf(active.id)} was dropped outside of any category.`,
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  const screenReaderInstructions: ScreenReaderInstructions = {
    draggable: `To pick up the ${noun}, press Space or Enter. Use the arrow keys to move it ${
      customOrder ? 'to another position or category' : 'to another category'
    }, then press Space or Enter to drop it, or Escape to cancel.`,
  };

  const activeItem = activeId != null ? itemsById.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={resetDrag}
    >
      <div
        className={`${
          kind === 'apps'
            ? appGridClasses.AppGrid
            : bookmarkGridClasses.BookmarkGrid
        } ${classes.Arranging}`}
      >
        {categories.map((category) => {
          const key = containerId(category.id);

          return (
            <CategoryColumn
              key={category.id}
              category={category}
              kind={kind}
              ids={containers[key] ?? []}
              itemsById={itemsById}
              customOrder={customOrder}
              highlighted={activeId != null && overContainer === key}
              disabled={saving}
              onEdit={onEdit}
            />
          );
        })}
      </div>

      <DragOverlay dropAnimation={customOrder ? undefined : null}>
        {activeItem ? (
          <div className={`${classes.Item} ${classes.Overlay}`}>
            <span className={classes.Handle}>
              <Icon icon="mdiDragVertical" color="var(--color-accent)" />
            </span>
            <TileContent item={activeItem} kind={kind} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
