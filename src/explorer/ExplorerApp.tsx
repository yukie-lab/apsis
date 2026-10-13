/**
 * Explorer mode: one 3D view of the solar system for all of the mode. The start screen and the flight screen are
 * layers on that view. The view comes from the same scene, the same mission and the same engine results as the
 * Expert mode: only the controls and the readouts are simpler.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp, nowEt } from '../app/store';
import { View3D } from '../ui/View3D';
import type { Scene3D } from '../render/scene/Scene3D';
import { Home } from './Home';
import { Flight } from './Flight';

export default function ExplorerApp() {
  const route = useApp((s) => s.route);
  const mission = useApp((s) => s.mission);
  const trajectory = useApp((s) => s.trajectory);
  const go = useApp((s) => s.go);
  const [scene, setScene] = useState<Scene3D | null>(null);
  const flying = route.page === 'flight' && !!mission && !!trajectory;
  // The address of the flight screen with no flight (a link, a reload of the page): show the start screen.
  useEffect(() => { if (route.page === 'flight' && !flying) go({ mode: 'explorer', page: 'home' }); }, [route.page, flying, go]);

  // The start screen shows the solar system at the time of the clock of the computer. The time runs.
  const live = useMemo(() => { const et0 = nowEt(), t0 = performance.now(); return () => et0 + (performance.now() - t0) / 1000; }, []);
  const craft = useMemo(() => ({ kind: mission?.spacecraft.kind ?? 'apsis', name: mission?.spacecraft.name || mission?.name || '' }), [mission?.spacecraft.kind, mission?.spacecraft.name, mission?.name]);
  const watch = useMemo(() => (mission?.plan ? [...new Set(mission.plan.nodes.map((n) => n.body))] : []), [mission?.plan]);
  return (
    <div className="explorer">
      <View3D className="full" trajectory={flying ? trajectory : null} craft={craft} watch={watch} time={flying ? undefined : live} onScene={setScene}>
        {flying
          ? <Flight scene={scene} mission={mission} trajectory={trajectory} />
          : <Home scene={scene} tab={route.page === 'famous' ? 'famous' : 'make'} time={live} />}
      </View3D>
    </div>
  );
}
