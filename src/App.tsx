import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";

type Pop = {
  id: number;
  x: number;
  y: number;
};

type Buff = {
  type: "tap" | "auto";
  remaining: number;
};

type Enemy = {
  id: number;
  health: number;
  maxHealth: number;
  x: number;
  y: number;
  approachX: number;
  approachY: number;
};

type Treasure = {
  type: "tap" | "auto";
  x: number;
  y: number;
};

const BUFF_DURATION = 30;
const ENEMY_CHASE_DURATION = 6_000;

const AUTO_POINTER_POSITIONS = [
  [79, 76], [16, 73], [80, 22], [17, 22],
  [50, 89], [50, 7], [92, 50], [5, 50],
];

const getEnemyCount = (points: number) => {
  if (points >= 100_000) return 5;
  if (points >= 10_000) return 4;
  if (points >= 1_000) return 3;
  if (points >= 100) return 2;
  return 1;
};

const formatScore = (value: number) => {
  const units = [
    { value: 1_000_000_000, suffix: "B" },
    { value: 1_000_000, suffix: "M" },
    { value: 1_000, suffix: "K" },
  ];
  const unit = units.find((candidate) => Math.abs(value) >= candidate.value);
  if (!unit) return value.toLocaleString();

  const compactValue = value / unit.value;
  const digits = Math.abs(compactValue) >= 100 ? 0 : 1;
  return `${compactValue.toFixed(digits).replace(/\.0$/, "")}${unit.suffix}`;
};

type ActionButtonProps = {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "weak" | "primary";
  className?: string;
};

function ActionButton({ children, onClick, disabled, tone = "primary", className = "" }: ActionButtonProps) {
  return (
    <button
      className={`action-button action-button--${tone} ${className}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

const achievements = [
  { target: 1, title: "첫 손길", description: "직접 탭 1회" },
  { target: 100, title: "백 번의 손길", description: "직접 탭 100회" },
  { target: 1_000, title: "리듬을 탄 손", description: "직접 탭 1,000회" },
  { target: 10_000, title: "멈추지 않는 손", description: "직접 탭 10,000회" },
  { target: 100_000, title: "숙련된 손", description: "직접 탭 100,000회" },
  { target: 1_000_000, title: "백만 번의 약속", description: "직접 탭 1,000,000회" },
  { target: 10_000_000, title: "전설의 손", description: "직접 탭 10,000,000회" },
  { target: 100_000_000, title: "시간을 두드린 손", description: "직접 탭 100,000,000회" },
  { target: 1_000_000_000, title: "세계를 두드린 손", description: "직접 탭 1,000,000,000회" },
];

function App() {
  const [points, setPoints] = useState(0);
  const [coins, setCoins] = useState(0);
  const [tapPower, setTapPower] = useState(1);
  const [autoTapLevel, setAutoTapLevel] = useState(0);
  const [rebirthCount, setRebirthCount] = useState(0);
  const [enemyDefeats, setEnemyDefeats] = useState(0);
  const [highestPoints, setHighestPoints] = useState(0);
  const [highestAutoRate, setHighestAutoRate] = useState(0);
  const [isGameReady, setIsGameReady] = useState(false);
  const [isRebirthConfirmOpen, setIsRebirthConfirmOpen] = useState(false);
  const [buff, setBuff] = useState<Buff | null>(null);
  const [treasure, setTreasure] = useState<Treasure | null>(null);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [shieldCharges, setShieldCharges] = useState(0);
  const [rewardNotice, setRewardNotice] = useState<string | null>(null);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"shop" | "achievements">("shop");
  const [totalTaps, setTotalTaps] = useState(0);
  const [pops, setPops] = useState<Pop[]>([]);
  const nextId = useRef(0);
  const gameContentRef = useRef<HTMLElement>(null);
  const tapButtonRef = useRef<HTMLButtonElement>(null);
  const pointsRef = useRef(points);
  const shieldChargesRef = useRef(shieldCharges);
  const tapPowerRef = useRef(tapPower);
  const enemyTimers = useRef(new Map<number, number>());
  const userIdRef = useRef<string | null>(null);
  const gameStateRef = useRef({
    points,
    coins,
    tapPower,
    autoTapLevel,
    rebirthCount,
    shieldCharges,
    totalTaps,
    enemyDefeats,
    highestPoints,
    highestAutoRate,
  });
  const exchangeableCoins = Math.floor(points / 10);
  const powerUpgradeCost = tapPower * 3;
  const autoTapCost = 12 + autoTapLevel * 8;
  const shieldCost = 18;
  const rebirthCost = (rebirthCount + 1) * 1_000;
  const activeTapPower = tapPower * (buff?.type === "tap" ? 2 : 1);
  const activeAutoRate = autoTapLevel * (buff?.type === "auto" ? 2 : 1);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    shieldChargesRef.current = shieldCharges;
  }, [shieldCharges]);

  useEffect(() => {
    tapPowerRef.current = tapPower;
  }, [tapPower]);

  useEffect(() => {
    gameStateRef.current = {
      points,
      coins,
      tapPower,
      autoTapLevel,
      rebirthCount,
      shieldCharges,
      totalTaps,
      enemyDefeats,
      highestPoints,
      highestAutoRate,
    };
  }, [
    autoTapLevel,
    coins,
    enemyDefeats,
    highestAutoRate,
    highestPoints,
    points,
    rebirthCount,
    shieldCharges,
    tapPower,
    totalTaps,
  ]);

  useEffect(() => {
    let isCancelled = false;

    const loadGame = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      let session = sessionData.session;

      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.session) {
          setRewardNotice("저장 연결을 준비 중이에요");
          setIsGameReady(true);
          return;
        }
        session = data.session;
      }

      userIdRef.current = session.user.id;
      const { data, error } = await supabase
        .from("game_states")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (isCancelled) return;
      if (error) {
        setRewardNotice("저장 공간을 준비 중이에요");
        setIsGameReady(true);
        return;
      }

      if (data) {
        const offlineSeconds = Math.min(
          8 * 60 * 60,
          Math.max(0, Math.floor((Date.now() - new Date(data.last_seen_at).getTime()) / 1000)),
        );
        const offlineReward = offlineSeconds * Number(data.auto_tap_level);
        setPoints(Number(data.points) + offlineReward);
        setCoins(Number(data.coins));
        setTapPower(Number(data.tap_power));
        setAutoTapLevel(Number(data.auto_tap_level));
        setRebirthCount(Number(data.rebirth_count));
        setShieldCharges(Number(data.shield_charges));
        setTotalTaps(Number(data.total_taps));
        setEnemyDefeats(Number(data.enemy_defeats));
        setHighestPoints(Math.max(Number(data.highest_points), Number(data.points) + offlineReward));
        setHighestAutoRate(Number(data.highest_auto_rate));
        if (offlineReward > 0) setRewardNotice(`오프라인 보상 +${offlineReward.toLocaleString()} 포인트`);
      }

      setIsGameReady(true);
    };

    void loadGame();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isGameReady) return;

    const saveGame = async () => {
      const userId = userIdRef.current;
      if (!userId) return;
      const state = gameStateRef.current;
      await supabase.from("game_states").upsert({
        user_id: userId,
        points: state.points,
        coins: state.coins,
        tap_power: state.tapPower,
        auto_tap_level: state.autoTapLevel,
        rebirth_count: state.rebirthCount,
        shield_charges: state.shieldCharges,
        total_taps: state.totalTaps,
        enemy_defeats: state.enemyDefeats,
        highest_points: state.highestPoints,
        highest_auto_rate: state.highestAutoRate,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    };

    const intervalId = window.setInterval(() => void saveGame(), 10_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") void saveGame();
    };
    window.addEventListener("pagehide", saveGame);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("pagehide", saveGame);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isGameReady]);

  useEffect(() => {
    setHighestPoints((currentHighest) => Math.max(currentHighest, points));
  }, [points]);

  useEffect(() => {
    setHighestAutoRate((currentHighest) => Math.max(currentHighest, activeAutoRate));
  }, [activeAutoRate]);

  useEffect(() => {
    if (!isGameReady || autoTapLevel === 0) return;

    const intervalId = window.setInterval(() => {
      setPoints((currentPoints) => currentPoints + activeAutoRate);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeAutoRate, autoTapLevel, isGameReady]);

  useEffect(() => {
    if (!buff) return;

    const intervalId = window.setInterval(() => {
      setBuff((currentBuff) => {
        if (!currentBuff || currentBuff.remaining <= 1) return null;
        return { ...currentBuff, remaining: currentBuff.remaining - 1 };
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [buff]);

  useEffect(() => {
    if (!isGameReady) return;
    const timers = enemyTimers.current;
    const resolveEnemy = (enemyId: number) => {
      setEnemies((currentEnemies) => currentEnemies.filter((enemy) => enemy.id !== enemyId));
      timers.delete(enemyId);

      if (shieldChargesRef.current > 0) {
        shieldChargesRef.current -= 1;
        setShieldCharges(shieldChargesRef.current);
        return;
      }

      setPoints((currentPoints) => Math.floor(currentPoints * 0.95));
    };

    const intervalId = window.setInterval(() => {
      const enemyCount = getEnemyCount(pointsRef.current);
      const nextEnemies = Array.from({ length: enemyCount }, (_, index) => {
        const id = Date.now() + index;
        const health = tapPowerRef.current * 2;
        const edge = Math.floor(Math.random() * 4);
        const edgePosition = 8 + Math.random() * 84;
        const x = edge === 0 ? -14 : edge === 1 ? 106 : edgePosition;
        const y = edge === 2 ? -14 : edge === 3 ? 106 : edgePosition;
        const contentBounds = gameContentRef.current?.getBoundingClientRect();
        const tapButtonBounds = tapButtonRef.current?.getBoundingClientRect();
        const startX = contentBounds ? (contentBounds.width * x) / 100 : 0;
        const startY = contentBounds ? (contentBounds.height * y) / 100 : 0;
        const buttonCenterX = contentBounds && tapButtonBounds
          ? tapButtonBounds.left - contentBounds.left + tapButtonBounds.width / 2
          : startX + 24;
        const buttonCenterY = contentBounds && tapButtonBounds
          ? tapButtonBounds.top - contentBounds.top + tapButtonBounds.height / 2
          : startY + 24;
        const enemyRadius = 24;
        const buttonRadius = tapButtonBounds ? Math.min(tapButtonBounds.width, tapButtonBounds.height) / 2 : 0;
        const startCenterX = startX + enemyRadius;
        const startCenterY = startY + enemyRadius;
        const directionX = startCenterX - buttonCenterX;
        const directionY = startCenterY - buttonCenterY;
        const distance = Math.max(Math.hypot(directionX, directionY), 1);
        const collisionDistance = buttonRadius + enemyRadius;
        const targetX = buttonCenterX + (directionX / distance) * collisionDistance;
        const targetY = buttonCenterY + (directionY / distance) * collisionDistance;
        const timeoutId = window.setTimeout(() => resolveEnemy(id), ENEMY_CHASE_DURATION);
        timers.set(id, timeoutId);
        return {
          id,
          health,
          maxHealth: health,
          x,
          y,
          approachX: targetX - startCenterX,
          approachY: targetY - startCenterY,
        };
      });

      setEnemies((currentEnemies) => [...currentEnemies, ...nextEnemies]);
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
      timers.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [isGameReady]);

  const addPoint = (event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const id = nextId.current++;

    setPoints((currentPoints) => currentPoints + activeTapPower);
    setTotalTaps((currentTaps) => currentTaps + 1);
    if (!treasure && !buff && Math.random() < 0.04) {
      const treasureSize = 66;
      const padding = 8;
      const contentBounds = gameContentRef.current?.getBoundingClientRect();
      const width = contentBounds?.width ?? 320;
      const height = contentBounds?.height ?? 600;
      setTreasure({
        type: Math.random() < 0.5 ? "tap" : "auto",
        x: padding + Math.random() * Math.max(0, width - treasureSize - padding * 2),
        y: padding + Math.random() * Math.max(0, height - treasureSize - padding * 2),
      });
    }
    setPops((currentPops) => [
      ...currentPops,
      {
        id,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
    ]);

    window.setTimeout(() => {
      setPops((currentPops) => currentPops.filter((pop) => pop.id !== id));
    }, 650);
  };

  const exchangePoints = () => {
    if (exchangeableCoins === 0) return;

    setPoints((currentPoints) => currentPoints % 10);
    setCoins((currentCoins) => currentCoins + exchangeableCoins);
  };

  const buyPowerUpgrade = () => {
    if (coins < powerUpgradeCost) return;

    setCoins((currentCoins) => currentCoins - powerUpgradeCost);
    setTapPower((currentPower) => currentPower + 1);
  };

  const buyAutoTapUpgrade = () => {
    if (coins < autoTapCost) return;

    setCoins((currentCoins) => currentCoins - autoTapCost);
    setAutoTapLevel((currentLevel) => currentLevel + 1);
  };

  const buyShield = () => {
    if (coins < shieldCost) return;

    setCoins((currentCoins) => currentCoins - shieldCost);
    setShieldCharges((currentCharges) => currentCharges + 1);
  };

  const rebirth = () => {
    if (coins < rebirthCost) return;

    enemyTimers.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    enemyTimers.current.clear();
    if (userIdRef.current) {
      void supabase.from("rebirth_history").insert({
        user_id: userIdRef.current,
        generation: rebirthCount + 1,
        reached_points: points,
        tap_power: tapPower,
        auto_tap_level: autoTapLevel,
      });
    }
    setPoints(0);
    setCoins(0);
    setTapPower((currentPower) => Math.max(1, Math.floor(currentPower / 2)));
    setAutoTapLevel((currentLevel) => currentLevel * 2);
    setShieldCharges(0);
    setBuff(null);
    setTreasure(null);
    setEnemies([]);
    setRebirthCount((currentCount) => currentCount + 1);
    setIsRebirthConfirmOpen(false);
  };

  const collectTreasure = () => {
    if (!treasure) return;

    setBuff({ type: treasure.type, remaining: BUFF_DURATION });
    setTreasure(null);
  };

  const attackEnemy = (enemyId: number) => {
    const targetEnemy = enemies.find((enemy) => enemy.id === enemyId);
    if (!targetEnemy) return;

    if (targetEnemy.health <= activeTapPower) {
      const timeoutId = enemyTimers.current.get(enemyId);
      if (timeoutId) window.clearTimeout(timeoutId);
      enemyTimers.current.delete(enemyId);
      setEnemies((currentEnemies) => currentEnemies.filter((enemy) => enemy.id !== enemyId));
      setCoins((currentCoins) => currentCoins + 1);
      setEnemyDefeats((currentDefeats) => currentDefeats + 1);
      setRewardNotice("방해꾼 처치! +1 코인");
      window.setTimeout(() => setRewardNotice(null), 1_400);
      return;
    }

    setEnemies((currentEnemies) =>
      currentEnemies.map((enemy) =>
        enemy.id === enemyId ? { ...enemy, health: enemy.health - activeTapPower } : enemy,
      ),
    );
  };

  return (
    <main className="game">
      <header className="game__top">
        <button
          className="menu-button"
          type="button"
          onClick={() => {
            setActivePanel("shop");
            setIsUpgradeOpen(true);
          }}
          aria-label="업그레이드 목록 열기"
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      <section className="game__content" aria-live="polite" ref={gameContentRef}>
        <div className="wallet" aria-label={`보유 코인 ${coins}개`}>
          <span className="wallet__coin" aria-hidden="true">●</span>
          <strong>{coins.toLocaleString()}</strong>
          <span>코인</span>
        </div>
        {shieldCharges > 0 && (
          <div className="shield-status" aria-label={`보호막 ${shieldCharges}회`}>
            🛡️ {shieldCharges}
          </div>
        )}
        {buff && (
          <div className="buff-status" aria-live="polite">
            <div>
              <strong>{buff.type === "tap" ? "탭 포인트 2배" : "오토 탭 2배"}</strong>
              <span>{buff.remaining}초</span>
            </div>
            <div className="buff-status__bar">
              <span style={{ width: `${(buff.remaining / BUFF_DURATION) * 100}%` }} />
            </div>
          </div>
        )}
        {rewardNotice && <p className="reward-notice">{rewardNotice}</p>}
        <strong className="game__score">{formatScore(points)}</strong>
        <p className="game__auto-rate">초당 +{activeAutoRate}/s</p>

        <button
          className="tap-button"
          type="button"
          onPointerDown={addPoint}
          aria-label={`점수 ${activeTapPower}점 올리기`}
          ref={tapButtonRef}
        >
          <span className="tap-button__shine" aria-hidden="true" />
          <span className="tap-button__plus" aria-hidden="true">
            +{activeTapPower}
          </span>
          <span className="tap-button__label">TAP!</span>
          {autoTapLevel > 0 && (
            <span className="auto-pointers" aria-hidden="true">
              {Array.from({ length: Math.min(autoTapLevel, AUTO_POINTER_POSITIONS.length) }, (_, index) => {
                const [x, y] = AUTO_POINTER_POSITIONS[index];
                return (
                  <span
                    className="auto-pointer"
                    key={index}
                    style={
                      {
                        "--pointer-x": `${x}%`,
                        "--pointer-y": `${y}%`,
                        "--pointer-delay": `${index * 90}ms`,
                      } as CSSProperties
                    }
                  >
                    ☝️
                  </span>
                );
              })}
              {autoTapLevel > AUTO_POINTER_POSITIONS.length && (
                <span className="auto-pointer-count">+{autoTapLevel - AUTO_POINTER_POSITIONS.length}</span>
              )}
            </span>
          )}
          {pops.map((pop) => (
            <span
              className="score-pop"
              key={pop.id}
              style={{ left: pop.x, top: pop.y }}
              aria-hidden="true"
            >
              +{activeTapPower}
            </span>
          ))}
        </button>
        {treasure && (
          <button
            className="event-treasure"
            type="button"
            onClick={collectTreasure}
            aria-label="보물 상자 열기"
            style={{ left: treasure.x, top: treasure.y }}
          >
            🎁
          </button>
        )}
        {enemies.map((enemy) => (
          <button
            className="enemy"
            type="button"
            onPointerDown={() => attackEnemy(enemy.id)}
            aria-label={`방해꾼 공격하기, 남은 체력 ${enemy.health}`}
            key={enemy.id}
            style={
              {
                left: `${enemy.x}%`,
                top: `${enemy.y}%`,
                "--enemy-approach-x": `${enemy.approachX}px`,
                "--enemy-approach-y": `${enemy.approachY}px`,
              } as CSSProperties
            }
          >
            <span aria-hidden="true">👾</span>
          </button>
        ))}
      </section>

      {isUpgradeOpen && (
        <div className="upgrade-overlay" role="presentation">
          <button
            className="upgrade-overlay__backdrop"
            type="button"
            onClick={() => setIsUpgradeOpen(false)}
            aria-label="업그레이드 목록 닫기"
          />
          <section
            className="upgrade-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
          >
            <div className="upgrade-sheet__handle" />
            <header className="upgrade-sheet__header">
              <div>
                <p>보유 코인 {coins.toLocaleString()}개</p>
                <h2 id="upgrade-title">{activePanel === "shop" ? "상점" : "업적"}</h2>
              </div>
              <button
                className="close-button"
                type="button"
                onClick={() => setIsUpgradeOpen(false)}
                aria-label="업그레이드 목록 닫기"
              >
                ×
              </button>
            </header>

            <div className="sheet-tabs" role="tablist" aria-label="메뉴">
              <button
                type="button"
                role="tab"
                aria-selected={activePanel === "shop"}
                className={activePanel === "shop" ? "sheet-tab sheet-tab--active" : "sheet-tab"}
                onClick={() => setActivePanel("shop")}
              >
                상점
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activePanel === "achievements"}
                className={activePanel === "achievements" ? "sheet-tab sheet-tab--active" : "sheet-tab"}
                onClick={() => setActivePanel("achievements")}
              >
                업적
              </button>
            </div>

            {activePanel === "shop" ? (
              <div className="upgrade-list">
                <article className="upgrade-card upgrade-card--exchange">
                  <div className="upgrade-card__icon" aria-hidden="true">🪙</div>
                  <div className="upgrade-card__details">
                    <strong>코인 환전</strong>
                    <span>클릭 포인트를 코인으로 바꿔요</span>
                    <small>10 포인트를 모으면 코인 1개를 받아요</small>
                  </div>
                  <ActionButton onClick={exchangePoints} disabled={exchangeableCoins === 0}>
                    환전하기
                  </ActionButton>
                </article>
                <article className="upgrade-card">
                  <div className="upgrade-card__icon" aria-hidden="true">☝️</div>
                  <div className="upgrade-card__details">
                    <strong>강한 탭</strong>
                    <span>탭 포인트가 구매할 때마다 +1 늘어나요</span>
                    <small>+{tapPower} 포인트 → +{tapPower + 1} 포인트</small>
                  </div>
                  <ActionButton onClick={buyPowerUpgrade} disabled={coins < powerUpgradeCost}>
                    {powerUpgradeCost} 코인
                  </ActionButton>
                </article>
                <article className="upgrade-card">
                  <div className="upgrade-card__icon" aria-hidden="true">🤖</div>
                  <div className="upgrade-card__details">
                    <strong>오토 탭</strong>
                    <span>자동 포인터 1개를 추가해요</span>
                    <small>현재 레벨 {autoTapLevel} · 초당 +{autoTapLevel}/s</small>
                  </div>
                  <ActionButton onClick={buyAutoTapUpgrade} disabled={coins < autoTapCost}>
                    {autoTapCost} 코인
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--shield">
                  <div className="upgrade-card__icon" aria-hidden="true">🛡️</div>
                  <div className="upgrade-card__details">
                    <strong>수호신의 보호막</strong>
                    <span>방해꾼이 빼앗는 포인트를 1회 막아줘요</span>
                    <small>보유 보호막 {shieldCharges}회</small>
                  </div>
                  <ActionButton onClick={buyShield} disabled={coins < shieldCost}>
                    {shieldCost} 코인
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--rebirth">
                  <div className="upgrade-card__icon" aria-hidden="true">✨</div>
                  <div className="upgrade-card__details">
                    <strong>누군가의 흔적</strong>
                    <span>탭 파워는 절반, 오토 탭은 2배로 다음 세대에 남겨요</span>
                    <small>환생 {rebirthCount}회 · 다음 환생 {rebirthCost.toLocaleString()} 코인</small>
                  </div>
                  <ActionButton onClick={() => setIsRebirthConfirmOpen(true)} disabled={coins < rebirthCost}>
                    환생하기
                  </ActionButton>
                </article>
              </div>
            ) : (
              <div className="achievement-list" role="tabpanel">
                <p className="achievement-summary">직접 탭 {totalTaps.toLocaleString()}회</p>
                {achievements.map((achievement) => {
                  const unlocked = totalTaps >= achievement.target;
                  const progress = Math.min((totalTaps / achievement.target) * 100, 100);

                  return (
                    <article
                      className={unlocked ? "achievement-card achievement-card--unlocked" : "achievement-card"}
                      key={achievement.target}
                    >
                      <div className="achievement-card__icon" aria-hidden="true">
                        {unlocked ? "🏆" : "🔒"}
                      </div>
                      <div className="achievement-card__details">
                        <div>
                          <strong>{achievement.title}</strong>
                          <span>{achievement.description}</span>
                        </div>
                        <div className="achievement-progress" aria-label={`${progress.toFixed(0)}% 달성`}>
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <small>{totalTaps.toLocaleString()} / {achievement.target.toLocaleString()}회</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {isRebirthConfirmOpen && (
        <div className="rebirth-confirm" role="presentation">
          <button
            className="rebirth-confirm__backdrop"
            type="button"
            onClick={() => setIsRebirthConfirmOpen(false)}
            aria-label="환생 취소"
          />
          <section className="rebirth-confirm__dialog" role="dialog" aria-modal="true" aria-labelledby="rebirth-title">
            <span className="rebirth-confirm__icon" aria-hidden="true">✨</span>
            <h2 id="rebirth-title">환생하시겠어요?</h2>
            <p className="rebirth-confirm__cost">{rebirthCost.toLocaleString()}코인이 필요해요.</p>
            <div className="rebirth-confirm__notice">
              <strong>초기화되는 것</strong>
              <span>포인트, 코인, 보호막, 진행 중인 이벤트</span>
              <strong>다음 세대에 남는 것</strong>
              <span>탭 파워의 절반, 오토 탭 2배, 직접 탭 업적</span>
            </div>
            <div className="rebirth-confirm__actions">
              <ActionButton tone="weak" onClick={() => setIsRebirthConfirmOpen(false)}>
                취소
              </ActionButton>
              <ActionButton onClick={rebirth}>
                {rebirthCost.toLocaleString()}코인으로 환생
              </ActionButton>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
