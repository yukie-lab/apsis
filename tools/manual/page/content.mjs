// Text and structure of the user manual (tools/manual/page/build.mjs makes manual/index.html from it).
//
// Each text has an English form (en) and a Japanese form (ja). The English text follows the writing rules of
// ASD-STE100 where the text stays clear: build.mjs gives each English sentence to the project tool
// tools/ste/ste-lint.mjs and writes the part of the sentences with no finding in the page.
// In a text, [[label]] is the label of a control of the application (the manual shows it in a box; the check of the
// English text reads it as a quotation), and `text` is a file name or a command. {name} is a value from
// tools/manual/values.mjs or from build.mjs.

const T = (en, ja) => ({ en, ja });

/** Marks of a picture: [name of the box in the .json file of the picture, text, position of the number ('bl', 'tr' or 'br'; default: top left)]. */
export function content() {
  return [
    // ---- Top of the page ---------------------------------------------------------------------------------------------
    {
      id: 'top', hero: true,
      title: T('Apsis user manual', 'Apsis 解説書'),
      blocks: [
        { lead: T('Apsis is an application for the design of flights through the solar system. It operates in your web browser.',
          'Apsis は、太陽系を飛ぶ探査機の飛行を設計するアプリケーションです。ウェブブラウザの中で動きます。') },
        { p: T('This manual has many pictures and few words. A number on a picture agrees with a number in the list below the picture.',
          'この解説書は、文よりも図と画像で説明します。画像の番号は、画像の下の一覧の番号と対応しています。') },
        { video: 'v1' },
      ],
    },
    // ---- What Apsis does ---------------------------------------------------------------------------------------------
    {
      id: 'overview', title: T('What Apsis does', 'Apsis でできること'),
      blocks: [
        { facts: [
          { icon: 'plan', t: T('Make the plan of a flight: transfers, launch windows, flybys and maneuvers.', '飛行を設計する: 遷移軌道、打ち上げ時期、フライバイ、軌道修正。') },
          { icon: 'view', t: T('See the flight in a 3D view. The bodies have their actual size and distance.', '飛行を 3D で見る。天体の大きさと距離は実際の値です。') },
          { icon: 'actual', t: T('Fly {missionCount} actual missions again, from Pioneer 11 to Mars 2020.', 'パイオニア 11 号からマーズ 2020 まで、実際の {missionCount} つのミッションを再現する。') },
          { icon: 'data', t: T('Positions of the planets from the JPL ephemeris DE440, years {coverStartYear} to {coverEndYear}.', '惑星の位置は JPL の天体暦 DE440 から({coverStartYear} 年〜{coverEndYear} 年)。') },
          { icon: 'check', t: T('Each number has a source and an accuracy limit.', 'すべての数値に、出典と精度の限界があります。') },
          { icon: 'lock', t: T('No server, no account, no record of your operations.', 'サーバーなし、アカウントなし、操作の記録なし。') },
        ] },
        { fig: 'browser', cap: T('The web server only sends the files. Your browser does all calculations and keeps your missions.',
          'ウェブサーバーはファイルを送るだけです。計算とミッションの保存は、すべてブラウザの中で行います。') },
        { fig: 'solar', cap: T('The planets on {epochDate}: the date of the pictures and the videos of this manual. The positions come from the ephemeris of Apsis.',
          '{epochDate}の惑星。この解説書の画像と動画の日付です。位置は Apsis の天体暦から求めました。') },
      ],
    },
    // ---- Open Apsis and the start screen -----------------------------------------------------------------------------
    {
      id: 'home', title: T('Open Apsis', 'Apsis を開く'),
      blocks: [
        { p: T('Apsis is a set of files. Put the files on a web server, or start a local server with these commands in the project directory:',
          'Apsis はファイルの集まりです。ファイルをウェブサーバーに置くか、プロジェクトのディレクトリで次のコマンドを実行してローカルサーバーを起動します。') },
        { cmd: ['npm install', 'npm run build', 'npm run preview'] },
        { p: T('Then open the address that the last command shows. A browser cannot open `dist/index.html` as a local file.',
          '最後のコマンドが表示するアドレスをブラウザで開きます。`dist/index.html` をファイルとして直接開くことはできません。') },
        { shot: 'explorer-home', title: T('The start screen (Explorer mode)', '最初の画面(Explorer モード)'),
          marks: [
            ['mode', T('Mode: Explorer or Expert. The two modes use the same mission.', 'モード: Explorer と Expert。2 つのモードは同じミッションを使います。')],
            ['time', T('Time of the view. At the start, this is the time now.', '表示の時刻。起動時は現在の時刻です。')],
            ['scale', T('True scale: the bodies have their actual size and distance.', '実寸: 天体の大きさと距離は実際の値です。')],
            ['tabs', T('Your mission, or an actual mission.', '自分のミッションか、実際のミッションか。')],
            ['chips', T('Destinations: planets, dwarf planets, asteroids and comets.', '行き先: 惑星、準惑星、小惑星、彗星。')],
            ['mars', T('The selected destination.', '選んだ行き先。')],
            ['card', T('Data of the destination at this time.', 'この時刻での行き先のデータ。')],
            ['goal', T('What the spacecraft does at the destination.', '行き先で探査機がすること。')],
            ['more', T('More options: type of flight, launch date, spacecraft model.', '詳しい設定: 飛行の種類、打ち上げ日、探査機のモデル。')],
            ['launch', T('Start the calculation of the flight.', '飛行の計算を始めます。')],
            ['about', T('About: data, licenses and your stored data.', 'About: データ、ライセンス、保存したデータ。')],
          ] },
      ],
    },
    // ---- Make a mission (Explorer) -------------------------------------------------------------------------------------
    {
      id: 'mission', title: T('Make a mission in the Explorer mode', 'Explorer モードでミッションを作る'),
      blocks: [
        { steps: [
          T('Select a destination below the 3D view.', '3D 表示の下で行き先を選びます。'),
          T('Select what the spacecraft does at the destination.', '行き先で探査機がすることを選びます。'),
          T('If necessary, open [[More options]] and change the options.', '必要なら [[More options]] を開いて設定を変えます。'),
          T('Click [[Launch to Mars]] (the button shows the name of your destination).', '[[Launch to Mars]] を押します(ボタンには行き先の名前が出ます)。'),
        ] },
        { shot: 'explorer-options', title: T('The options of a flight to Saturn', '土星への飛行の設定'),
          marks: [
            ['goals', T('Goal at the destination. The list changes with the body.', '行き先ですること。選べる項目は天体によって変わります。')],
            ['style', T('Type of flight: minimum propellant, or short flight time.', '飛行の種類: 推進剤が最小か、飛行時間が短いか。')],
            ['date', T('Earliest launch date: the search of the launch date starts at this date.', '最も早い打ち上げ日: 打ち上げ日の探索はこの日から始まります。')],
            ['model', T('Spacecraft model: the 3D model in the view.', '探査機のモデル: 3D 表示に使う模型です。')],
            ['launch', T('Launch: Apsis finds the launch date and calculates the flight.', '打ち上げ: Apsis が打ち上げ日を探し、飛行を計算します。')],
          ] },
        { p: T('After the click, Apsis examines the launch dates of the next {searchMonths} months. For each launch date, it finds the transfer with the smallest change of velocity.',
          'ボタンを押すと、Apsis はこの先 {searchMonths} か月の打ち上げ日を調べます。打ち上げ日ごとに、速度の変化が最も小さい遷移軌道を探します。') },
        { fig: 'search', cap: T('The search for the flight to Mars of the first video. Two launch windows have approximately the same value. Apsis selects the lower value.',
          '1 本目の動画の火星への飛行の探索。2 つの打ち上げ時期の値はほぼ同じで、Apsis は小さいほうを選びます。') },
        { p: T('Then Apsis calculates the flight in three steps:', '次に、Apsis は 3 つの段階で飛行を計算します。') },
        { steps: [
          T('A simple model uses only the gravity of the Sun (patched conics).', '太陽の重力だけを使う簡単なモデル(パッチド・コニック)で道すじを決めます。'),
          T('A numerical integration adds the gravity of the planets, the Moon, Pluto and three large asteroids.', '数値積分で、惑星、月、冥王星、3 つの大きな小惑星の重力を加えます。'),
          T('Apsis adjusts the velocity at the start. Thus the flight goes to the aim point at the destination.', '出発時の速度を調整し、行き先の目標点を通るようにします。'),
        ] },
        { fig: 'flight', cap: T('The result: the flight to Mars from the search above. Each path in Apsis is the result of a calculation.',
          '結果: 上の探索で決まった火星への飛行。Apsis の軌道は、すべて計算の結果です。') },
      ],
    },
    // ---- Watch the flight ------------------------------------------------------------------------------------------------
    {
      id: 'flight', title: T('Watch the flight', '飛行を見る'),
      blocks: [
        { shot: 'explorer-flight', title: T('A flight to Mars at the closest approach', '火星への飛行、最接近の時点'),
          marks: [
            ['back', T('Go to the start screen.', '最初の画面に戻ります。')],
            ['title', T('Name of the flight, time of the view and day of the flight.', '飛行の名前、表示の時刻、飛行の何日目か。'), 'bl'],
            ['numbers', T('[[Show the numbers]]: open this flight in the Expert mode.', '[[Show the numbers]]: この飛行を Expert モードで開きます。')],
            ['views', T('Camera: automatic, spacecraft, destination or solar system.', 'カメラ: 自動、探査機、行き先、太陽系。')],
            ['data', T('Flight data: speed, distances, altitude and the next event.', '飛行データ: 速さ、距離、高度、次の出来事。')],
            ['caption', T('Event of the flight at this time.', 'この時刻の出来事。')],
            ['note', T('Notes about this view. Click to open them.', 'この表示についての注記。押すと開きます。')],
            ['buttons', T('Event before this time, start or stop of the time, next event.', '前の出来事、時間の再生と停止、次の出来事。')],
            ['timeline', T('Time line of the flight. Move it to change the time.', '飛行の時間軸。動かすと時刻が変わります。')],
            ['rate', T('Time rate: how much flight time each second shows.', '時間の速さ: 1 秒で何時間分の飛行を見せるか。')],
          ] },
        { controls: true },
        { shot: 'explorer-notes', title: T('Notes about this view', '表示についての注記'),
          marks: [['notes', T('What is true in the 3D view, and what is only an aid to see the objects.', '3D 表示のうち実際の値のものと、見やすくするための表示の区別。')]] },
        { shot: 'explorer-done', title: T('End of the flight', '飛行の終わり'),
          marks: [['summary', T('Flight time, launch energy (C3) and the velocity change of the maneuvers. Then fly again, show the numbers, or make a new mission.', '飛行時間、打ち上げエネルギー (C3)、軌道修正の速度変化。もう一度飛ぶ、数値を見る、新しいミッションを作る、を選べます。')]] },
      ],
    },
    // ---- Actual missions --------------------------------------------------------------------------------------------------
    {
      id: 'actual', title: T('Fly an actual mission', '実際のミッションを飛ぶ'),
      blocks: [
        { p: T('Apsis calculates each actual mission again in your browser. The inputs are the launch time, the bodies, the dates of the encounters and the aim point at the last body.',
          'Apsis は実際の各ミッションを、ブラウザの中で計算し直します。入力は、打ち上げ時刻、天体と遭遇の日付、最後の天体での目標点です。') },
        { shot: 'explorer-famous', title: T('Actual missions', '実際のミッション'),
          marks: [
            ['tabs', T('Open the tab [[Actual missions]].', '[[Actual missions]] のタブを開きます。')],
            ['chips', T('Select a mission. The number is the launch year.', 'ミッションを選びます。数字は打ち上げの年です。')],
            ['card', T('What the mission did, its launch date and its route.', 'ミッションの内容、打ち上げ日、経路。')],
            ['fly', T('[[Fly this mission]]: Apsis calculates the flight.', '[[Fly this mission]]: Apsis が飛行を計算します。')],
          ] },
        { missions: true },
        { shot: 'explorer-voyager2', title: T('Voyager 2 at Jupiter', '木星でのボイジャー 2 号'),
          marks: [
            ['caption', T('Closest approach to Jupiter: altitude and speed relative to Jupiter.', '木星への最接近: 高度と、木星に対する速さ。')],
            ['data', T('Flight data at this time.', 'この時刻の飛行データ。')],
          ] },
      ],
    },
    // ---- Expert mode ------------------------------------------------------------------------------------------------------
    {
      id: 'expert', title: T('The Expert mode', 'Expert モード'),
      blocks: [
        { p: T('The Expert mode shows the plan, the maneuvers and all numbers. Use the top bar to change the mode.',
          'Expert モードでは、計画、軌道修正、すべての数値を見られます。モードは上のバーで切り替えます。') },
        { shot: 'expert-mission', title: T('The Mission screen with Voyager 2', 'Mission 画面(ボイジャー 2 号)'),
          marks: [
            ['mode', T('Mode.', 'モード。')],
            ['context', T('Time scale, frame, center and unit of distance for all screens.', 'すべての画面に共通の時刻系、座標系、中心、距離の単位。')],
            ['nav', T('Screens of the Expert mode.', 'Expert モードの画面の一覧。')],
            ['view', T('3D view of the mission.', 'ミッションの 3D 表示。')],
            ['mission', T('The open mission: plan and flight. Save it or close it here.', '開いているミッション(計画と飛行)。ここで保存と終了をします。')],
            ['status', T('Time of the view, frame, center, units and ephemeris.', '表示の時刻、座標系、中心、単位、天体暦。')],
          ] },
        { screens: [
          ['Mission', T('Make, open, save and close a mission. Compare an actual mission with its actual flight.', 'ミッションの作成、読み込み、保存。実際のミッションと実際の飛行の比較。')],
          ['Ephemeris', T('Position, velocity and orbit elements of a body at a time.', 'ある時刻の天体の位置、速度、軌道要素。')],
          ['Transfer', T('Orbit from one body to a second body for two dates.', '2 つの日付で、ある天体から別の天体へ向かう軌道。')],
          ['Launch windows', T('Map of the launch energy for many pairs of dates.', '多くの日付の組み合わせでの打ち上げエネルギーの図。')],
          ['Flyby tour', T('Sequence of bodies and dates, with flybys and an optimizer.', 'フライバイを含む天体と日付の並び。最適化つき。')],
          ['Maneuvers', T('Change, add and aim the maneuvers of the flight.', '飛行の軌道修正の変更、追加、狙いの設定。')],
          ['Propagation', T('Start state and force model of the flight.', '飛行の初期状態と力のモデル。')],
          ['Files', T('Read and write trajectory files of other programs.', '他のプログラムの軌道ファイルの読み書き。')],
          ['Accuracy', T('Measured errors and the items with no check.', '測定した誤差と、確かめていない項目。')],
          ['Glossary', T('The technical names of the application.', 'アプリで使う専門用語。')],
        ] },
        { shot: 'expert-mission-start', title: T('Start of the Mission screen', 'Mission 画面の最初の状態'),
          marks: [['famous', T('Actual missions. [[Open]] calculates the mission again in your browser.', '実際のミッション。[[Open]] でブラウザの中で計算し直します。')]] },
        { shot: 'expert-source', crop: [1260, 232, 1620, 930], title: T('The source of a value', '数値の出典'),
          marks: [
            ['button', T('The button i is near a value or a heading.', '数値や見出しの横にあるボタン i。')],
            ['pop', T('Method, accuracy, and the results of the automatic tests for this type of value.', 'その種類の数値の計算方法、精度、自動テストの結果。')],
          ] },
        { shot: 'expert-mission-compare', title: T('Voyager 2: the flight of Apsis and the actual flight', 'ボイジャー 2 号: Apsis の飛行と実際の飛行'),
          note: T('The dates of the encounters and the aim point at the last body are inputs. The radius at each flyby before the last body and each v∞ are results.',
            '遭遇の日付と最後の天体での目標点は入力です。最後より前の各フライバイの半径と、各 v∞ は計算結果です。') },
      ],
    },
    // ---- Orbits ---------------------------------------------------------------------------------------------------------
    {
      id: 'orbits', title: T('Orbits: the basics', '軌道の基本'),
      blocks: [
        { video: 'v2' },
        { fig: 'conics', cap: T('The same start point and the same direction, with six different speeds. At {vCircular} km/s the orbit is a circle. At {vEscape} km/s the orbit does not close.',
          '出発点と向きは同じで、速さだけが違う 6 つの軌道。秒速 {vCircular} km で円軌道、秒速 {vEscape} km で軌道は閉じなくなります。') },
        { fig: 'ellipse', cap: T('The Sun is at one focus of the ellipse. The spacecraft is fast near the periapsis and slow near the apoapsis.',
          '太陽は楕円の焦点の 1 つにあります。探査機は近点の近くで速く、遠点の近くで遅くなります。') },
        { fig: 'elements', cap: T('Six values give one orbit and one position on it. The angles i, Ω and ω give the direction of the orbit in space.',
          '6 つの値で、軌道とその上の位置が 1 つに決まります。角度 i、Ω、ω は空間での軌道の向きを表します。') },
        { shot: 'expert-ephemeris', title: T('The Ephemeris screen', 'Ephemeris 画面'),
          note: T('Select a body and a date. The screen shows the position, the velocity, the orbit elements and the constants of the body.',
            '天体と日付を選ぶと、位置、速度、軌道要素、天体の定数が表示されます。') },
      ],
    },
    // ---- Transfers --------------------------------------------------------------------------------------------------------
    {
      id: 'transfer', title: T('Transfers and launch windows', '遷移軌道と打ち上げ時期'),
      blocks: [
        { video: 'v3' },
        { shot: 'expert-transfer', title: T('The Transfer screen: from the Earth to Mars', 'Transfer 画面: 地球から火星へ'),
          marks: [
            ['bodies', T('Departure body, arrival body and the two dates.', '出発天体、到着天体、2 つの日付。')],
            ['find', T('[[Find the best dates]]: search in one synodic period.', '[[Find the best dates]]: 1 会合周期の中で探します。')],
            ['budget', T('Velocity budget of the transfer (patched conics).', '遷移の速度の収支(パッチド・コニック)。')],
            ['make', T('Make a mission from these dates.', 'この日付でミッションを作ります。')],
            ['top', T('Top view of the transfer.', '遷移を上から見た図。')],
            ['legs', T('Orbit elements of the transfer orbit.', '遷移軌道の軌道要素。')],
            ['hohmann', T('Comparison with a Hohmann transfer between circular orbits.', '円軌道どうしのホーマン遷移との比較。')],
          ] },
        { fig: 'porkchop', cap: T('A launch window map (porkchop plot). Each point of the map is one transfer. The lowest C3 is {bestC3} km²/s²: a launch on {depDate} and a flight of {bestTof} days.',
          '打ち上げ時期の図(ポークチョップ図)。図の 1 点が 1 つの遷移軌道です。C3 の最小値は {bestC3} km²/s²: {depDate}に打ち上げ、{bestTof} 日の飛行です。') },
        { fig: 'series', cap: T('The good dates come again after each synodic period. For Mars, this is approximately {synodicMonths} months.',
          '良い日付は会合周期ごとにくり返します。火星では約 {synodicMonths} か月です。') },
        { shot: 'expert-windows', title: T('The Launch windows screen', 'Launch windows 画面'),
          marks: [
            ['ranges', T('Bodies and the ranges of the dates.', '天体と日付の範囲。')],
            ['actual', T('Maps for the first leg of an actual mission.', '実際のミッションの最初の区間の図。')],
            ['map', T('The map: C3, total Δv, arrival v∞ or departure Δv. Click a point to select its dates.', '図: C3、合計 Δv、到着時 v∞、出発時 Δv。点を押すとその日付を選べます。')],
            ['minimum', T('The dates with the minimum total Δv.', '合計 Δv が最小の日付。')],
            ['open', T('Open these dates in the Transfer screen.', 'この日付を Transfer 画面で開きます。')],
          ] },
      ],
    },
    // ---- Flybys -----------------------------------------------------------------------------------------------------------
    {
      id: 'tour', title: T('Flybys and tours', 'フライバイとスイングバイ'),
      blocks: [
        { video: 'v4' },
        { fig: 'voyager', cap: T('The flight of Voyager 2 that Apsis calculates. The gravity of each planet sends the spacecraft to the next planet.',
          'Apsis が計算したボイジャー 2 号の飛行。各惑星の重力が、探査機を次の惑星へ送ります。') },
        { fig: 'turn', cap: T('Relative to Jupiter, the spacecraft moves on a hyperbola. A flyby nearer to the planet gives a larger turn.',
          '木星から見ると、探査機は双曲線の上を動きます。惑星の近くを通るほど、大きく曲がります。') },
        { fig: 'speed', cap: T('After Jupiter, Voyager 2 is faster than the escape speed from the solar system. The flybys use no propellant.',
          '木星のあと、ボイジャー 2 号は太陽系からの脱出速度より速くなります。フライバイは推進剤を使いません。') },
        { shot: 'expert-tour', title: T('The Flyby tour screen with Voyager 2', 'Flyby tour 画面(ボイジャー 2 号)'),
          marks: [
            ['sequence', T('Sequence of bodies and dates. Each flyby shows v∞ in and out, the turn angle, the altitude and the engine burn.', '天体と日付の並び。各フライバイの入出の v∞、曲がる角度、高度、エンジン噴射。')],
            ['legs', T('Legs: complete revolutions, retrograde transfer and deep-space maneuver.', '区間: 周回数、逆行遷移、深宇宙マヌーバ。')],
            ['tiss', T('Tisserand graph of the plan.', '計画のティスラン図。')],
            ['optimizer', T('Optimizer: it changes the free dates. The global search finds other launch windows.', '最適化: 自由な日付を変えます。全体探索は別の打ち上げ時期も探します。')],
          ] },
      ],
    },
    // ---- Maneuvers ---------------------------------------------------------------------------------------------------------
    {
      id: 'maneuvers', title: T('Maneuvers', '軌道修正(マヌーバ)'),
      blocks: [
        { p: T('A maneuver is one engine burn. In Apsis, each maneuver changes the velocity in zero time.',
          'マヌーバは 1 回のエンジン噴射です。Apsis では、各マヌーバは一瞬で速度を変えます。') },
        { shot: 'expert-maneuvers', title: T('The Maneuvers screen with Cassini', 'Maneuvers 画面(カッシーニ)'),
          marks: [['list', T('Maneuvers of the flight: date, frame and the three components of the velocity change.', '飛行の軌道修正: 日付、座標系、速度変化の 3 成分。')]] },
        { fig: 'vnb', cap: T('A local frame for a maneuver. The frame RTN uses the radial direction, not the direction of the velocity.',
          '軌道修正に使う局所座標系。RTN 座標系は、速度の方向ではなく動径方向を使います。') },
      ],
    },
    // ---- Propagation --------------------------------------------------------------------------------------------------------
    {
      id: 'propagation', title: T('Propagation and forces', '伝搬計算と力のモデル'),
      blocks: [
        { p: T('The engine integrates the equations of motion with all forces of the model in each step.',
          'エンジンは、各ステップでモデルのすべての力を入れて運動方程式を積分します。') },
        { shot: 'expert-propagation-earth', crop: [0, 0, 2880, 1600], title: T('The Propagation screen: an orbit about the Earth', 'Propagation 画面: 地球をまわる軌道'),
          marks: [
            ['start', T('Start state: position and velocity, or orbit elements.', '初期状態: 位置と速度、または軌道要素。')],
            ['force', T('Force model: gravity of each body, J2, relativity and radiation pressure.', '力のモデル: 各天体の重力、J2、相対論の補正、放射圧。')],
          ] },
        { shot: 'expert-propagation-earth', crop: [380, 3040, 2500, 1000], title: T('Effect of each force on this flight', 'この飛行への各力の影響'),
          marks: [['compare', T('The distance from the flight on the screen when one force of the model changes. Logarithmic scale.', 'モデルの力を 1 つ変えたときの、画面の飛行との距離(対数目盛)。')]] },
      ],
    },
    // ---- Files -----------------------------------------------------------------------------------------------------------------
    {
      id: 'files', title: T('Files', 'ファイル'),
      blocks: [
        { p: T('Apsis reads and writes CCSDS OEM and OPM files, STK ephemeris files, JPL Horizons vector tables, CSV tables and its mission files. All the work is on your computer.',
          'Apsis は CCSDS の OEM と OPM、STK のエフェメリス、JPL Horizons のベクトル表、CSV 表、自分のミッションファイルを読み書きします。処理はすべてあなたのコンピュータの中です。') },
        { shot: 'expert-files', title: T('The Files screen with Voyager 2', 'Files 画面(ボイジャー 2 号)'),
          marks: [
            ['text', T('Start of the file.', 'ファイルの最初の部分。')],
            ['write', T('Write the flight to a file.', '飛行をファイルに書き出します。')],
          ] },
      ],
    },
    // ---- Accuracy ------------------------------------------------------------------------------------------------------------------
    {
      id: 'accuracy', title: T('Accuracy', '精度'),
      blocks: [
        { p: T('The Accuracy screen shows the measured errors of the engine. It also shows the items with no check and the limits of the models.',
          'Accuracy 画面には、エンジンの誤差の測定値があります。確かめていない項目と、モデルの限界も載っています。') },
        { shot: 'expert-accuracy', title: T('The Accuracy screen', 'Accuracy 画面'),
          marks: [['banner', T('[[Do the checks]] calculates the values again in your browser and compares them with the reference values.', '[[Do the checks]] でブラウザの中で計算し直し、基準値と比べます。')]] },
        { fig: 'accuracy', cap: T('Each actual mission, each flyby: the difference between the flight of Apsis and the JPL Horizons trajectory. The dashed lines are the limits of the tests.',
          '実際のミッションの各フライバイについて、Apsis の飛行と JPL Horizons の軌道の差。破線はテストの限界です。') },
        { list: [
          T('Each maneuver changes the velocity in zero time.', '各マヌーバは一瞬で速度を変えます。'),
          T('The force model has no atmosphere, no higher gravity terms and no attitude.', '力のモデルには、大気、高次の重力項、姿勢がありません。'),
          T('A flight starts in a circular parking orbit. The model does not include the launch from the ground.', '飛行は円形の待機軌道から始まります。地上からの打ち上げは含みません。'),
          T('The planet data is for 1950 to 2100. The small-body data is for 1980 to 2060.', '惑星のデータは 1950〜2100 年、小天体のデータは 1980〜2060 年です。'),
        ], title: T('Some limits of the models', 'モデルの限界(一部)') },
      ],
    },
    // ---- Glossary -------------------------------------------------------------------------------------------------------------------
    {
      id: 'glossary', title: T('Glossary', '用語集'),
      blocks: [
        { shot: 'expert-glossary', title: T('The Glossary screen', 'Glossary 画面'),
          note: T('The glossary has {glossaryCount} technical names. Enter a word in the search field to find a term.',
            '用語集には {glossaryCount} の専門用語があります。検索欄に語を入れると用語を探せます。') },
      ],
    },
    // ---- Your data -------------------------------------------------------------------------------------------------------------------
    {
      id: 'data', title: T('Your data', 'あなたのデータ'),
      blocks: [
        { list: [
          T('Your browser does all calculations. Apsis has no user accounts.', '計算はすべてブラウザが行います。ユーザーアカウントはありません。'),
          T('Apsis gets only its files from the web server. It sends no data.', 'Apsis はウェブサーバーから自分のファイルを受け取るだけで、データを送りません。'),
          T('Apsis does not record your operations. It uses no cookies.', '操作を記録せず、Cookie も使いません。'),
          T('The storage of the browser keeps your settings, your saved missions and the bodies that you added.', '設定、保存したミッション、追加した天体は、ブラウザの保存領域に残ります。'),
        ] },
        { shot: 'about', crop: [0, 0, 2880, 1240], title: T('The About page', 'About ページ'),
          marks: [['remove', T('[[Remove the stored data]] removes your settings, missions and bodies from this browser.', '[[Remove the stored data]] で、設定、ミッション、天体をこのブラウザから消します。')]] },
      ],
    },
    // ---- About this manual ----------------------------------------------------------------------------------------------------------
    {
      id: 'manual', title: T('About this manual', 'この解説書について'),
      blocks: [
        { list: [
          T('The numbers, the orbits and the flight paths in the figures and the videos are results of the engine of Apsis. The script `tools/manual/data/manual-data.spec.ts` calculates them.',
            '図と動画の数値、軌道、飛行経路は、すべて Apsis のエンジンの計算結果です。スクリプト `tools/manual/data/manual-data.spec.ts` が計算しました。'),
          T('The pictures show Apsis {version} on {epochDate}. The Explorer mode starts at the time now, thus your screen shows different dates.',
            '画像は {epochDate}の Apsis {version} です。Explorer モードは現在の時刻で始まるので、あなたの画面の日付は違います。'),
          T('The voice of the videos is Kokoro-82M (voice af_heart), a speech model that operates on a computer with no service on the internet.',
            '動画の音声は、インターネットのサービスを使わずにコンピュータの中で動く音声合成モデル Kokoro-82M(声 af_heart)です。'),
          T('Each video has subtitles in Japanese and in English. The page shows the subtitles of the language of the page. The menu of the video player can change them.',
            '各動画には日本語と英語の字幕があります。ページの言語の字幕を表示します。動画プレーヤーのメニューで切り替えられます。'),
          T('A speech recognition model (Whisper small.en) made a text from the narration. Relative to the script, the word error rate of this text is {werPct} %.',
            '音声認識モデル(Whisper small.en)でナレーションを文字にしました。台本に対する単語誤り率は {werPct} % です。'),
          T('The English text uses the writing rules of ASD-STE100 for most sentences. The tool `tools/ste/ste-lint.mjs` found no problem in {steOk} of the {steAll} English sentences and headings of this page ({stePct} %). For the narration of the videos, the result is {steNarrOk} of {steNarrAll} sentences ({steNarrPct} %). The tool uses the word lists of the project, not the official ASD-STE100 dictionary.',
            '英語の文は、多くの文で ASD-STE100 の書き方の規則に従っています。プロジェクトのツール `tools/ste/ste-lint.mjs` は、このページの英語の文と見出し {steAll} のうち {steOk}({stePct} %)に問題を見つけませんでした。動画のナレーションでは、{steNarrAll} 文のうち {steNarrOk}({steNarrPct} %)です。このツールは ASD-STE100 の公式辞書ではなく、プロジェクトの語のリストを使います。'),
        ] },
        { downloads: true },
        { credits: true },
      ],
    },
  ];
}

/** Stories of the actual missions (the English texts are the texts of the application: src/i18n/locales/en/39-explorer.json). */
export const STORY_JA = {
  voyager2: 'ボイジャー 2 号は木星、土星、天王星、海王星をフライバイしました。各惑星の重力が、探査機を次の惑星へ送りました。',
  cassini: 'カッシーニは金星を 2 回、続いて地球と木星をフライバイしました。フライバイのたびに速さを得て、土星をまわる軌道に入りました。',
  newhorizons: 'ニュー・ホライズンズは木星の重力で速さを得て、冥王星をフライバイしました。',
  voyager1: 'ボイジャー 1 号は木星と土星をフライバイしました。土星では衛星タイタンの近くを飛び、惑星の軌道面の外へ出ました。',
  mars2020: 'マーズ 2020 はフライバイをせずに火星へ飛び、探査車パーサヴィアランスとともに大気に入りました。',
  juno: 'ジュノーは太陽のまわりを 1 周したあと、地球をフライバイして速さを得て、木星をまわる軌道に入りました。',
  ulysses: 'ユリシーズは木星の重力を使って惑星の軌道面の外へ出て、太陽の極の上を飛びました。',
  pioneer11: 'パイオニア 11 号は木星をフライバイし、太陽系を横切って土星へ向かいました。土星に着いた最初の探査機です。',
};

/** Japanese names of the missions. */
export const MISSION_JA = {
  voyager2: 'ボイジャー 2 号', cassini: 'カッシーニ', newhorizons: 'ニュー・ホライズンズ', voyager1: 'ボイジャー 1 号',
  mars2020: 'マーズ 2020', juno: 'ジュノー', ulysses: 'ユリシーズ', pioneer11: 'パイオニア 11 号',
};

/** Texts of the parts of the page (not of a section). */
export const UI = {
  contents: T('Contents', '目次'),
  language: T('Language', '言語'),
  video: T('Video', '動画'),
  minutes: T('{m} min {s} s', '{m} 分 {s} 秒'),
  transcript: T('Text of the narration', 'ナレーションの文'),
  download: T('Download', 'ダウンロード'),
  picture: T('Picture', '画像'),
  figure: T('Figure', '図'),
  zoom: T('Open the full picture', '画像を拡大'),
  close: T('Close', '閉じる'),
  controlsTitle: T('Move the view', '表示の操作'),
  // The English texts are the text of the application (src/i18n/locales/en/38-scene.json, "howTo"): build.mjs compares them.
  turn: T('Turn the view: move one finger, or move the mouse with the button down.', '視点を回す: 1 本指で動かすか、マウスのボタンを押したまま動かします。'),
  zoomView: T('Change the distance: use two fingers or the mouse wheel.', '距離を変える: 2 本指か、マウスホイールを使います。'),
  missionCol: T('Mission', 'ミッション'),
  launchCol: T('Launch', '打ち上げ'),
  routeCol: T('Route', '経路'),
  storyCol: T('What it did', '内容'),
  dlVideo: T('Video', '動画'),
  dlLength: T('Length', '長さ'),
  dlFiles: T('Files', 'ファイル'),
  credits: T('Software and data of the manual', '解説書のソフトウェアとデータ'),
  screensTitle: T('Screens of the Expert mode', 'Expert モードの画面'),
  steps: T('Steps', '手順'),
  top: T('Go to the top', '先頭へ'),
  meta: T('Apsis {version}. The pictures show the application on {epochDate}.', 'Apsis {version}。画像は {epochDate}のアプリケーションです。'),
  subsEn: T('English subtitles', '英語字幕'),
  subsJa: T('Japanese subtitles', '日本語字幕'),
  footer: T('Apsis {version} user manual.', 'Apsis {version} 解説書'),
};

/** Software and data that made the manual (the manual has no other parts). */
export const CREDITS = [
  T('Voice: Kokoro-82M v1.0 (Apache-2.0), voice af_heart, ONNX model onnx-community/Kokoro-82M-v1.0-ONNX. The model card gives this CC BY audio in the training data: Koniwa tnc (CC BY 3.0) and SIWIS (CC BY 4.0).',
    '音声: Kokoro-82M v1.0(Apache-2.0)、声 af_heart、ONNX モデル onnx-community/Kokoro-82M-v1.0-ONNX。モデルカードには、学習データの CC BY の音声として Koniwa tnc(CC BY 3.0)と SIWIS(CC BY 4.0)が記載されています。'),
  T('Software for the voice: kokoro-js 1.2.1, Transformers.js 3.8.1 and phonemizer 1.2.1 (Apache-2.0), ONNX Runtime (MIT). The phonemizer package contains eSpeak NG (GPL version 3 or later).',
    '音声のソフトウェア: kokoro-js 1.2.1、Transformers.js 3.8.1、phonemizer 1.2.1(Apache-2.0)、ONNX Runtime(MIT)。phonemizer には eSpeak NG(GPL バージョン 3 以降)が含まれます。'),
  T('Text in the videos: the font Inter (SIL Open Font License 1.1), MathJax 4.1.3 with its font mathjax-newcm (Apache-2.0), opentype.js 2.0.0 (MIT).',
    '動画の文字: フォント Inter(SIL Open Font License 1.1)、MathJax 4.1.3 とそのフォント mathjax-newcm(Apache-2.0)、opentype.js 2.0.0(MIT)。'),
  T('Frames of the videos: Google Chrome and Playwright. Encoding: FFmpeg with x264 (H.264) and AAC.',
    '動画のフレーム: Google Chrome と Playwright。エンコード: FFmpeg(x264 による H.264 と AAC)。'),
  T('Check of the narration: Whisper small.en (model Xenova/whisper-small.en).', 'ナレーションの確認: Whisper small.en(モデル Xenova/whisper-small.en)。'),
  T('Figures, pictures and videos: the engine and the screens of Apsis {version}. The About page of Apsis gives the sources and the licenses of its data.',
    '図、画像、動画: Apsis {version} のエンジンと画面。データの出典とライセンスは Apsis の About ページにあります。'),
];
