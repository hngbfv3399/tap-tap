import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";

type Pop = {
  id: number;
  x: number;
  y: number;
};

type Buff = {
  multiplier: 2 | 10;
  remaining: number;
  duration: number;
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
  type: "tap-2" | "tap-10" | "cookie";
  x: number;
  y: number;
};

const ENEMY_CHASE_DURATION = 6_000;
const FIRST_TREASURE_DELAY = [60_000, 90_000] as const;
const TREASURE_DELAY = [120_000, 180_000] as const;

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

const getMilestoneMultiplier = (count: number) =>
  2 ** [10, 25, 50].filter((milestone) => count >= milestone).length;

const getNextMilestone = (count: number) =>
  [10, 25, 50].find((milestone) => count < milestone) ?? null;

const getLegacyCost = (level: number) => level + 1;
const getLegacyTotal = (lifetimePoints: number) => Math.floor(Math.cbrt(lifetimePoints / 100_000));

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
  const [autoTapWorkers, setAutoTapWorkers] = useState(0);
  const [autoTapPower, setAutoTapPower] = useState(1);
  const [workshopCount, setWorkshopCount] = useState(0);
  const [factoryCount, setFactoryCount] = useState(0);
  const [guardianWorkerLevel, setGuardianWorkerLevel] = useState(0);
  const [savings, setSavings] = useState(0);
  const [rebirthCount, setRebirthCount] = useState(0);
  const [lifetimePoints, setLifetimePoints] = useState(0);
  const [legacyPoints, setLegacyPoints] = useState(0);
  const [legacyEarnedTotal, setLegacyEarnedTotal] = useState(0);
  const [legacyProductionLevel, setLegacyProductionLevel] = useState(0);
  const [legacyOfflineLevel, setLegacyOfflineLevel] = useState(0);
  const [legacyBountyLevel, setLegacyBountyLevel] = useState(0);
  const [legacyTreasureLevel, setLegacyTreasureLevel] = useState(0);
  const [legacyStartCoinsLevel, setLegacyStartCoinsLevel] = useState(0);
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
  const [activePanel, setActivePanel] = useState<"shop" | "workers" | "legacy" | "achievements">("shop");
  const [totalTaps, setTotalTaps] = useState(0);
  const [pops, setPops] = useState<Pop[]>([]);
  const nextId = useRef(0);
  const gameContentRef = useRef<HTMLElement>(null);
  const tapButtonRef = useRef<HTMLButtonElement>(null);
  const pointsRef = useRef(points);
  const shieldChargesRef = useRef(shieldCharges);
  const tapPowerRef = useRef(tapPower);
  const enemyTheftRateRef = useRef(0.05);
  const buffRef = useRef<Buff | null>(buff);
  const treasureRef = useRef<Treasure | null>(treasure);
  const enemyTimers = useRef(new Map<number, number>());
  const userIdRef = useRef<string | null>(null);
  const gameStateRef = useRef({
    points,
    coins,
    tapPower,
    autoTapWorkers,
    autoTapPower,
    workshopCount,
    factoryCount,
    guardianWorkerLevel,
    savings,
    rebirthCount,
    lifetimePoints,
    legacyPoints,
    legacyEarnedTotal,
    legacyProductionLevel,
    legacyOfflineLevel,
    legacyBountyLevel,
    legacyTreasureLevel,
    legacyStartCoinsLevel,
    shieldCharges,
    totalTaps,
    enemyDefeats,
    highestPoints,
    highestAutoRate,
  });
  const exchangeableCoins = Math.floor(points / 10);
  const powerUpgradeCost = Math.ceil(50 * 1.2 ** (tapPower - 1));
  const autoTapperCost = Math.ceil(20 * 1.15 ** autoTapWorkers);
  const autoTapPowerCost = Math.ceil(40 * 1.15 ** (autoTapPower - 1));
  const workshopCost = Math.ceil(120 * 1.15 ** workshopCount);
  const factoryCost = Math.ceil(700 * 1.15 ** factoryCount);
  const guardianWorkerCost = 25 + guardianWorkerLevel * 15;
  const shieldCost = 18;
  const rebirthCost = (rebirthCount + 1) * 1_000;
  const generationMultiplier = (1 + rebirthCount * 0.05) * (1 + legacyProductionLevel * 0.02);
  const totalLegacyAvailable = getLegacyTotal(lifetimePoints);
  const pendingLegacyPoints = Math.max(0, totalLegacyAvailable - legacyEarnedTotal);
  const treasureDelayMultiplier = 1 - legacyTreasureLevel * 0.05;
  const achievementMultiplier = 1 + achievements.filter((achievement) => totalTaps >= achievement.target).length * 0.003;
  const autoTapperMilestone = getMilestoneMultiplier(autoTapWorkers);
  const workshopMilestone = getMilestoneMultiplier(workshopCount);
  const factoryMilestone = getMilestoneMultiplier(factoryCount);
  const workshopBonus = 1 + workshopCount * 0.05 * workshopMilestone;
  const baseAutoRate = autoTapWorkers * autoTapPower * autoTapperMilestone * workshopBonus;
  const factoryRate = factoryCount * 20 * factoryMilestone;
  const activeTapPower = Math.max(1, Math.floor(tapPower * generationMultiplier * achievementMultiplier * (buff?.multiplier ?? 1)));
  const activeAutoRate = Math.floor((baseAutoRate + factoryRate) * generationMultiplier * achievementMultiplier);
  const enemyTheftRate = Math.max(0.01, 0.05 - guardianWorkerLevel * 0.005);
  const nextSavingsInterest = Math.floor(savings * 0.05);

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
    enemyTheftRateRef.current = enemyTheftRate;
  }, [enemyTheftRate]);

  useEffect(() => {
    buffRef.current = buff;
  }, [buff]);

  useEffect(() => {
    treasureRef.current = treasure;
  }, [treasure]);

  useEffect(() => {
    gameStateRef.current = {
      points,
      coins,
      tapPower,
      autoTapWorkers,
      autoTapPower,
      workshopCount,
      factoryCount,
      guardianWorkerLevel,
      savings,
      rebirthCount,
      lifetimePoints,
      legacyPoints,
      legacyEarnedTotal,
      legacyProductionLevel,
      legacyOfflineLevel,
      legacyBountyLevel,
      legacyTreasureLevel,
      legacyStartCoinsLevel,
      shieldCharges,
      totalTaps,
      enemyDefeats,
      highestPoints,
      highestAutoRate,
    };
  }, [
    autoTapWorkers,
    autoTapPower,
    workshopCount,
    factoryCount,
    guardianWorkerLevel,
    coins,
    enemyDefeats,
    highestAutoRate,
    highestPoints,
    points,
    rebirthCount,
    lifetimePoints,
    legacyPoints,
    legacyEarnedTotal,
    legacyProductionLevel,
    legacyOfflineLevel,
    legacyBountyLevel,
    legacyTreasureLevel,
    legacyStartCoinsLevel,
    shieldCharges,
    savings,
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
        const savedWorkers = Number(data.auto_tap_level);
        const savedAutoTapPower = Number(data.auto_tap_power ?? 1);
        const savedWorkshops = Number(data.workshop_count ?? 0);
        const savedFactories = Number(data.factory_count ?? 0);
        const savedRebirthCount = Number(data.rebirth_count);
        const savedTotalTaps = Number(data.total_taps);
        const savedOfflineLevel = Number(data.legacy_offline_level ?? 0);
        const savedAchievementMultiplier = 1 + achievements.filter((achievement) => savedTotalTaps >= achievement.target).length * 0.003;
        const savedAutoBase = savedWorkers * savedAutoTapPower * getMilestoneMultiplier(savedWorkers)
          * (1 + savedWorkshops * 0.05 * getMilestoneMultiplier(savedWorkshops));
        const savedFactoryRate = savedFactories * 20 * getMilestoneMultiplier(savedFactories);
        const savedProductionMultiplier = (1 + savedRebirthCount * 0.05) * (1 + Number(data.legacy_production_level ?? 0) * 0.02);
        const offlineReward = Math.floor(offlineSeconds * (savedAutoBase + savedFactoryRate) * savedProductionMultiplier * savedAchievementMultiplier * (1 + savedOfflineLevel * 0.1));
        setPoints(Number(data.points) + offlineReward);
        setLifetimePoints(Number(data.lifetime_points ?? data.highest_points ?? data.points) + offlineReward);
        setCoins(Number(data.coins));
        setTapPower(Number(data.tap_power));
        setAutoTapWorkers(savedWorkers);
        setAutoTapPower(savedAutoTapPower);
        setWorkshopCount(savedWorkshops);
        setFactoryCount(savedFactories);
        setGuardianWorkerLevel(Number(data.guardian_worker_level ?? 0));
        setSavings(Number(data.savings_points ?? 0));
        setRebirthCount(savedRebirthCount);
        setLegacyPoints(Number(data.legacy_points ?? 0));
        setLegacyEarnedTotal(Number(data.legacy_earned_total ?? 0));
        setLegacyProductionLevel(Number(data.legacy_production_level ?? 0));
        setLegacyOfflineLevel(savedOfflineLevel);
        setLegacyBountyLevel(Number(data.legacy_bounty_level ?? 0));
        setLegacyTreasureLevel(Number(data.legacy_treasure_level ?? 0));
        setLegacyStartCoinsLevel(Number(data.legacy_start_coins_level ?? 0));
        setShieldCharges(Number(data.shield_charges));
        setTotalTaps(savedTotalTaps);
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
        auto_tap_level: state.autoTapWorkers,
        auto_tap_power: state.autoTapPower,
        workshop_count: state.workshopCount,
        factory_count: state.factoryCount,
        guardian_worker_level: state.guardianWorkerLevel,
        savings_points: state.savings,
        rebirth_count: state.rebirthCount,
        lifetime_points: state.lifetimePoints,
        legacy_points: state.legacyPoints,
        legacy_earned_total: state.legacyEarnedTotal,
        legacy_production_level: state.legacyProductionLevel,
        legacy_offline_level: state.legacyOfflineLevel,
        legacy_bounty_level: state.legacyBountyLevel,
        legacy_treasure_level: state.legacyTreasureLevel,
        legacy_start_coins_level: state.legacyStartCoinsLevel,
        rebirth_tap_multiplier: 1,
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
    if (!isGameReady || autoTapWorkers === 0) return;

    const intervalId = window.setInterval(() => {
      setPoints((currentPoints) => currentPoints + activeAutoRate);
      setLifetimePoints((currentPoints) => currentPoints + activeAutoRate);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeAutoRate, autoTapWorkers, isGameReady]);

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

      setPoints((currentPoints) => Math.floor(currentPoints * (1 - enemyTheftRateRef.current)));
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

  useEffect(() => {
    if (!isGameReady) return;

    let timeoutId: number;
    const randomDelay = ([min, max]: readonly [number, number]) => (min + Math.random() * (max - min)) * treasureDelayMultiplier;
    const scheduleTreasure = (delayRange: readonly [number, number]) => {
      timeoutId = window.setTimeout(() => {
        if (buffRef.current || treasureRef.current) {
          scheduleTreasure([10_000, 15_000]);
          return;
        }

        const treasureSize = 66;
        const padding = 8;
        const contentBounds = gameContentRef.current?.getBoundingClientRect();
        const width = contentBounds?.width ?? 320;
        const height = contentBounds?.height ?? 600;
        const rewardRoll = Math.random();
        const nextTreasure: Treasure = {
          type: rewardRoll < 0.7 ? "tap-2" : rewardRoll < 0.73 ? "tap-10" : "cookie",
          x: padding + Math.random() * Math.max(0, width - treasureSize - padding * 2),
          y: padding + Math.random() * Math.max(0, height - treasureSize - padding * 2),
        };
        treasureRef.current = nextTreasure;
        setTreasure(nextTreasure);
        scheduleTreasure(TREASURE_DELAY);
      }, randomDelay(delayRange));
    };

    scheduleTreasure(FIRST_TREASURE_DELAY);
    return () => window.clearTimeout(timeoutId);
  }, [isGameReady, treasureDelayMultiplier]);

  const addPoint = (event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const id = nextId.current++;

    setPoints((currentPoints) => currentPoints + activeTapPower);
    setLifetimePoints((currentPoints) => currentPoints + activeTapPower);
    setTotalTaps((currentTaps) => currentTaps + 1);
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

  const upgradeAutoTapper = () => {
    if (coins < autoTapperCost) return;

    setCoins((currentCoins) => currentCoins - autoTapperCost);
    setAutoTapWorkers((currentLevel) => currentLevel + 1);
  };

  const upgradeAutoTapPower = () => {
    if (coins < autoTapPowerCost) return;

    setCoins((currentCoins) => currentCoins - autoTapPowerCost);
    setAutoTapPower((currentPower) => currentPower + 1);
  };

  const buyWorkshop = () => {
    if (autoTapWorkers < 10 || coins < workshopCost) return;

    setCoins((currentCoins) => currentCoins - workshopCost);
    setWorkshopCount((currentCount) => currentCount + 1);
  };

  const buyFactory = () => {
    if (workshopCount < 5 || coins < factoryCost) return;

    setCoins((currentCoins) => currentCoins - factoryCost);
    setFactoryCount((currentCount) => currentCount + 1);
  };

  const upgradeGuardianWorker = () => {
    if (coins < guardianWorkerCost) return;

    setCoins((currentCoins) => currentCoins - guardianWorkerCost);
    setGuardianWorkerLevel((currentLevel) => currentLevel + 1);
  };

  const buyShield = () => {
    if (coins < shieldCost) return;

    setCoins((currentCoins) => currentCoins - shieldCost);
    setShieldCharges((currentCharges) => currentCharges + 1);
  };

  const depositSavings = () => {
    const deposit = Math.floor(points / 2);
    if (deposit === 0) return;

    setPoints((currentPoints) => currentPoints - Math.floor(currentPoints / 2));
    setSavings((currentSavings) => currentSavings + deposit);
    setRewardNotice(`적금 +${formatScore(deposit)} 포인트`);
    window.setTimeout(() => setRewardNotice(null), 1_400);
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
        auto_tap_level: autoTapWorkers,
      });
    }
    setLegacyPoints((currentPoints) => currentPoints + pendingLegacyPoints);
    setLegacyEarnedTotal(totalLegacyAvailable);
    setPoints(nextSavingsInterest);
    setLifetimePoints((currentPoints) => currentPoints + nextSavingsInterest);
    setCoins(legacyStartCoinsLevel);
    setTapPower(1);
    setAutoTapWorkers(0);
    setAutoTapPower(1);
    setWorkshopCount(0);
    setFactoryCount(0);
    setGuardianWorkerLevel(0);
    setShieldCharges(0);
    setBuff(null);
    buffRef.current = null;
    setTreasure(null);
    treasureRef.current = null;
    setEnemies([]);
    setSavings((currentSavings) => currentSavings + Math.floor(currentSavings * 0.05));
    setRebirthCount((currentCount) => currentCount + 1);
    setIsRebirthConfirmOpen(false);
  };

  const buyLegacyUpgrade = (
    level: number,
    maxLevel: number,
    upgrade: React.Dispatch<React.SetStateAction<number>>,
  ) => {
    const cost = getLegacyCost(level);
    if (level >= maxLevel || legacyPoints < cost) return;

    setLegacyPoints((currentPoints) => currentPoints - cost);
    upgrade((currentLevel) => currentLevel + 1);
  };

  const collectTreasure = () => {
    if (!treasure) return;

    if (treasure.type === "cookie") {
      const cookieReward = Math.max(25, activeAutoRate * 120 + activeTapPower * 100);
      setPoints((currentPoints) => currentPoints + cookieReward);
      setLifetimePoints((currentPoints) => currentPoints + cookieReward);
      setRewardNotice(`행운의 쿠키! +${formatScore(cookieReward)} 포인트`);
      window.setTimeout(() => setRewardNotice(null), 1_400);
    } else {
      const duration = treasure.type === "tap-10" ? 5 : 15;
      setBuff({ multiplier: treasure.type === "tap-10" ? 10 : 2, remaining: duration, duration });
    }
    setTreasure(null);
    treasureRef.current = null;
  };

  const attackEnemy = (enemyId: number) => {
    const targetEnemy = enemies.find((enemy) => enemy.id === enemyId);
    if (!targetEnemy) return;

    if (targetEnemy.health <= activeTapPower) {
      const timeoutId = enemyTimers.current.get(enemyId);
      if (timeoutId) window.clearTimeout(timeoutId);
      enemyTimers.current.delete(enemyId);
      setEnemies((currentEnemies) => currentEnemies.filter((enemy) => enemy.id !== enemyId));
      setCoins((currentCoins) => currentCoins + 1 + legacyBountyLevel);
      setEnemyDefeats((currentDefeats) => currentDefeats + 1);
      setRewardNotice(`방해꾼 처치! +${1 + legacyBountyLevel} 코인`);
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
              <strong>탭 포인트 {buff.multiplier}배</strong>
              <span>{buff.remaining}초</span>
            </div>
            <div className="buff-status__bar">
              <span style={{ width: `${(buff.remaining / buff.duration) * 100}%` }} />
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
          {(autoTapWorkers > 0 || guardianWorkerLevel > 0) && (
            <span className="auto-pointers" aria-hidden="true">
              {[
                { level: autoTapWorkers, icon: "🧑", position: AUTO_POINTER_POSITIONS[0] },
                { level: guardianWorkerLevel, icon: "🧑‍🚒", position: AUTO_POINTER_POSITIONS[1] },
              ].map(({ level, icon, position }, index) => {
                if (level === 0) return null;
                const [x, y] = position;
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
                    {icon}
                    {index === 0 && <span className="auto-pointer-count">×{level}</span>}
                  </span>
                );
              })}
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
                <h2 id="upgrade-title">
                  {activePanel === "shop" ? "상점" : activePanel === "workers" ? "작업자" : activePanel === "legacy" ? "세대 기억" : "업적"}
                </h2>
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
                aria-selected={activePanel === "workers"}
                className={activePanel === "workers" ? "sheet-tab sheet-tab--active" : "sheet-tab"}
                onClick={() => setActivePanel("workers")}
              >
                작업자
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activePanel === "legacy"}
                className={activePanel === "legacy" ? "sheet-tab sheet-tab--active" : "sheet-tab"}
                onClick={() => setActivePanel("legacy")}
              >
                세대
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
                    <span>탭 포인트를 구매할 때마다 +1 올려요</span>
                    <small>
                      +{Math.floor(tapPower * generationMultiplier)} 포인트 → +{Math.floor((tapPower + 1) * generationMultiplier)} 포인트 · 가격 20% 상승
                    </small>
                  </div>
                  <ActionButton onClick={buyPowerUpgrade} disabled={coins < powerUpgradeCost}>
                    {powerUpgradeCost} 코인
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
                <article className="upgrade-card upgrade-card--savings">
                  <div className="upgrade-card__icon" aria-hidden="true">🏦</div>
                  <div className="upgrade-card__details">
                    <strong>세대 적금</strong>
                    <span>현재 포인트의 절반을 적금해 다음 세대에 남겨요</span>
                    <small>적금 {formatScore(savings)} · 다음 환생 이자 +{formatScore(nextSavingsInterest)}</small>
                  </div>
                  <ActionButton onClick={depositSavings} disabled={points < 2}>
                    절반 넣기
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--rebirth">
                  <div className="upgrade-card__icon" aria-hidden="true">✨</div>
                  <div className="upgrade-card__details">
                    <strong>누군가의 흔적</strong>
                    <span>모든 생산량이 세대마다 5%씩 늘고, 적금도 5% 불어나요</span>
                    <small>환생 {rebirthCount}회 · 다음 환생 {rebirthCost.toLocaleString()} 코인</small>
                  </div>
                  <ActionButton onClick={() => setIsRebirthConfirmOpen(true)} disabled={coins < rebirthCost}>
                    환생하기
                  </ActionButton>
                </article>
              </div>
            ) : activePanel === "workers" ? (
              <div className="upgrade-list" role="tabpanel">
                <article className="upgrade-card upgrade-card--worker">
                  <div className="upgrade-card__icon" aria-hidden="true">🧑</div>
                  <div className="upgrade-card__details">
                    <strong>자동 탭퍼 고용</strong>
                    <span>작업자 한 명이 초당 +{autoTapPower}/s를 만들어요</span>
                    <small>
                      {autoTapWorkers}명 · 마일스톤 ×{autoTapperMilestone}
                      {getNextMilestone(autoTapWorkers) ? ` · 다음 ${getNextMilestone(autoTapWorkers)}명` : " · 모든 마일스톤 완료"}
                    </small>
                  </div>
                  <ActionButton onClick={upgradeAutoTapper} disabled={coins < autoTapperCost}>
                    {autoTapperCost} 코인
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--worker">
                  <div className="upgrade-card__icon" aria-hidden="true">🛠️</div>
                  <div className="upgrade-card__details">
                    <strong>탭 작업대</strong>
                    <span>자동 탭퍼 전체 생산량을 작업대 1개당 5% 높여요</span>
                    <small>
                      {autoTapWorkers < 10
                        ? `자동 탭퍼 ${autoTapWorkers}/10명 필요`
                        : `${workshopCount}개 · 자동 탭퍼 보너스 +${(workshopCount * 5 * workshopMilestone).toFixed(0)}% · 마일스톤 ×${workshopMilestone}`}
                    </small>
                  </div>
                  <ActionButton onClick={buyWorkshop} disabled={autoTapWorkers < 10 || coins < workshopCost}>
                    {autoTapWorkers < 10 ? "잠김" : `${workshopCost} 코인`}
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--worker">
                  <div className="upgrade-card__icon" aria-hidden="true">🏭</div>
                  <div className="upgrade-card__details">
                    <strong>탭 공장</strong>
                    <span>독립적으로 초당 20포인트를 생산해요</span>
                    <small>
                      {workshopCount < 5
                        ? `탭 작업대 ${workshopCount}/5개 필요`
                        : `${factoryCount}개 · 기본 초당 +${factoryRate} · 마일스톤 ×${factoryMilestone}`}
                    </small>
                  </div>
                  <ActionButton onClick={buyFactory} disabled={workshopCount < 5 || coins < factoryCost}>
                    {workshopCount < 5 ? "잠김" : `${factoryCost} 코인`}
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--worker">
                  <div className="upgrade-card__icon" aria-hidden="true">⚙️</div>
                  <div className="upgrade-card__details">
                    <strong>자동 탭 강화</strong>
                    <span>모든 자동 탭퍼의 초당 생산량을 +1 올려요</span>
                    <small>작업자 1명당 초당 +{autoTapPower} → +{autoTapPower + 1}</small>
                  </div>
                  <ActionButton onClick={upgradeAutoTapPower} disabled={coins < autoTapPowerCost}>
                    {autoTapPowerCost} 코인
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--worker">
                  <div className="upgrade-card__icon" aria-hidden="true">🧑‍🚒</div>
                  <div className="upgrade-card__details">
                    <strong>수호 작업자</strong>
                    <span>방해꾼이 빼앗는 포인트를 줄여요</span>
                    <small>레벨 {guardianWorkerLevel} · 약탈 {(enemyTheftRate * 100).toFixed(1)}%</small>
                  </div>
                  <ActionButton onClick={upgradeGuardianWorker} disabled={coins < guardianWorkerCost}>
                    {guardianWorkerCost} 코인
                  </ActionButton>
                </article>
              </div>
            ) : activePanel === "legacy" ? (
              <div className="upgrade-list" role="tabpanel">
                <p className="achievement-summary">
                  누적 {formatScore(lifetimePoints)} 포인트 · 보유 기억 {legacyPoints}개 · 이번 환생 +{pendingLegacyPoints}개
                </p>
                <article className="upgrade-card upgrade-card--rebirth">
                  <div className="upgrade-card__icon" aria-hidden="true">✨</div>
                  <div className="upgrade-card__details">
                    <strong>세대의 힘</strong>
                    <span>전체 탭·자동 생산량을 영구적으로 2% 올려요</span>
                    <small>레벨 {legacyProductionLevel}/10 · 현재 +{legacyProductionLevel * 2}%</small>
                  </div>
                  <ActionButton onClick={() => buyLegacyUpgrade(legacyProductionLevel, 10, setLegacyProductionLevel)} disabled={legacyProductionLevel >= 10 || legacyPoints < getLegacyCost(legacyProductionLevel)}>
                    {legacyProductionLevel >= 10 ? "완료" : `${getLegacyCost(legacyProductionLevel)} 기억`}
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--worker">
                  <div className="upgrade-card__icon" aria-hidden="true">🌙</div>
                  <div className="upgrade-card__details">
                    <strong>깨어 있는 기록</strong>
                    <span>오프라인 자동 생산 보상을 10% 올려요</span>
                    <small>레벨 {legacyOfflineLevel}/5 · 현재 +{legacyOfflineLevel * 10}%</small>
                  </div>
                  <ActionButton onClick={() => buyLegacyUpgrade(legacyOfflineLevel, 5, setLegacyOfflineLevel)} disabled={legacyOfflineLevel >= 5 || legacyPoints < getLegacyCost(legacyOfflineLevel)}>
                    {legacyOfflineLevel >= 5 ? "완료" : `${getLegacyCost(legacyOfflineLevel)} 기억`}
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--worker">
                  <div className="upgrade-card__icon" aria-hidden="true">⚔️</div>
                  <div className="upgrade-card__details">
                    <strong>사냥꾼의 기억</strong>
                    <span>방해꾼 처치 보상 코인을 +1 올려요</span>
                    <small>레벨 {legacyBountyLevel}/5 · 처치 보상 +{1 + legacyBountyLevel} 코인</small>
                  </div>
                  <ActionButton onClick={() => buyLegacyUpgrade(legacyBountyLevel, 5, setLegacyBountyLevel)} disabled={legacyBountyLevel >= 5 || legacyPoints < getLegacyCost(legacyBountyLevel)}>
                    {legacyBountyLevel >= 5 ? "완료" : `${getLegacyCost(legacyBountyLevel)} 기억`}
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--worker">
                  <div className="upgrade-card__icon" aria-hidden="true">🎁</div>
                  <div className="upgrade-card__details">
                    <strong>보물의 흔적</strong>
                    <span>보물 등장 대기 시간을 5% 줄여요</span>
                    <small>레벨 {legacyTreasureLevel}/5 · 현재 -{legacyTreasureLevel * 5}%</small>
                  </div>
                  <ActionButton onClick={() => buyLegacyUpgrade(legacyTreasureLevel, 5, setLegacyTreasureLevel)} disabled={legacyTreasureLevel >= 5 || legacyPoints < getLegacyCost(legacyTreasureLevel)}>
                    {legacyTreasureLevel >= 5 ? "완료" : `${getLegacyCost(legacyTreasureLevel)} 기억`}
                  </ActionButton>
                </article>
                <article className="upgrade-card upgrade-card--exchange">
                  <div className="upgrade-card__icon" aria-hidden="true">🪙</div>
                  <div className="upgrade-card__details">
                    <strong>여행 경비</strong>
                    <span>환생 후 시작 코인을 1개 올려요</span>
                    <small>레벨 {legacyStartCoinsLevel}/5 · 다음 시작 {legacyStartCoinsLevel} 코인</small>
                  </div>
                  <ActionButton onClick={() => buyLegacyUpgrade(legacyStartCoinsLevel, 5, setLegacyStartCoinsLevel)} disabled={legacyStartCoinsLevel >= 5 || legacyPoints < getLegacyCost(legacyStartCoinsLevel)}>
                    {legacyStartCoinsLevel >= 5 ? "완료" : `${getLegacyCost(legacyStartCoinsLevel)} 기억`}
                  </ActionButton>
                </article>
              </div>
            ) : (
              <div className="achievement-list" role="tabpanel">
                <p className="achievement-summary">
                  직접 탭 {totalTaps.toLocaleString()}회 · 달성 업적 {achievements.filter((achievement) => totalTaps >= achievement.target).length}개 · 전체 생산 +{((achievementMultiplier - 1) * 100).toFixed(1)}%
                </p>
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
            <p className="rebirth-confirm__cost">세대 기억 +{pendingLegacyPoints}개를 얻어요.</p>
            <div className="rebirth-confirm__notice">
              <strong>초기화되는 것</strong>
              <span>포인트, 코인, 탭·작업자·작업대·공장 강화, 보호막, 진행 중인 이벤트</span>
              <strong>다음 세대에 남는 것</strong>
              <span>세대 생산 +5%, 세대 기억과 영구 연구, 적금 5% 이자와 이자 포인트, 직접 탭 업적</span>
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
