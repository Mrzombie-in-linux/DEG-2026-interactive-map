// Election statistics data (loaded from CSV)
let electionData = {};

// Map RU codes from the SVG to our region IDs
const regionCodeMap = {
    "RU-AL": "altai-republic",
    "RU-ALT": "altai-krai",
    "RU-AD": "adygeya",
    "RU-AMU": "amur-oblast",
    "RU-ARK": "arkhangelsk",
    "RU-AST": "astrakhan",
    "RU-BA": "bashkortostan",
    "RU-BEL": "belgorod",
    "RU-BRY": "bryansk",
    "RU-BU": "buryatia",
    "RU-CE": "chechnya",
    "RU-CHE": "chelyabinsk",
    "RU-CHU": "chukotka",
    "RU-CR": "crimea",
    "RU-CU": "chuvash",
    "RU-DA": "dagestan",
    "RU-DON": "donetsk",
    "RU-HR": "kherson",
    "RU-IN": "ingushetia",
    "RU-IRK": "irkutsk",
    "RU-IVA": "ivanovo",
    "RU-KAM": "kamchatka",
    "RU-KB": "kabardino-balkaria",
    "RU-KC": "karachay-cherkessia",
    "RU-KDA": "krasnodar",
    "RU-KEM": "kemerovo",
    "RU-KGD": "kaliningrad",
    "RU-KGN": "kurgan",
    "RU-KHA": "khabarovsk",
    "RU-KHM": "khanty-mansiysk",
    "RU-KIR": "kirov",
    "RU-KK": "khakassia",
    "RU-KL": "kalmykia",
    "RU-KLU": "kaluga",
    "RU-KO": "komi",
    "RU-KOS": "kostroma",
    "RU-KR": "karelia",
    "RU-KRS": "kursk",
    "RU-KYA": "krasnoyarsk",
    "RU-LEN": "leningrad-oblast",
    "RU-LIP": "lipetsk",
    "RU-LUG": "lugansk",
    "RU-MAG": "magadan",
    "RU-ME": "mari-el",
    "RU-MO": "mordovia",
    "RU-MOS": "moscow-oblast",
    "RU-MOW": "moscow-city",
    "RU-MUR": "murmansk",
    "RU-NEN": "nenets",
    "RU-NGR": "novgorod",
    "RU-NIZ": "nizhny-novgorod",
    "RU-NVS": "novosibirsk",
    "RU-OMS": "omsk",
    "RU-ORE": "orenburg",
    "RU-ORL": "orlovskaya",
    "RU-PER": "perm-krai",
    "RU-PNZ": "penza",
    "RU-PRI": "primorsky",
    "RU-PSK": "pskov",
    "RU-ROS": "rostov",
    "RU-RYA": "ryazan",
    "RU-SA": "sakha",
    "RU-SAK": "sakhalin",
    "RU-SAM": "samara",
    "RU-SAR": "saratov",
    "RU-SE": "north-ossetia",
    "RU-SEV": "sevastopol",
    "RU-SMO": "smolensk",
    "RU-SPE": "st-petersburg",
    "RU-STA": "stavropol",
    "RU-SVE": "sverdlovsk",
    "RU-TA": "tatarstan",
    "RU-TAM": "tambov",
    "RU-TOM": "tomsk",
    "RU-TUL": "tula",
    "RU-TVE": "tver",
    "RU-TY": "tuva",
    "RU-TYU": "tyumen",
    "RU-UD": "udmurt",
    "RU-ULY": "ulyanovsk",
    "RU-VGG": "volgograd",
    "RU-VLA": "vladimir",
    "RU-VLG": "vologda",
    "RU-VOR": "voronezh",
    "RU-YAN": "yamalo-nenets",
    "RU-YAR": "yaroslavl",
    "RU-YEV": "jewish-ao",
    "RU-ZAB": "zabaykalsky",
    "RU-ZP": "zaporozhye",
    "RU-KOS": "kostroma"
};

const regionNames = {
    "altai-republic": "Республика Алтай",
    "altai-krai": "Алтайский край",
    "adygeya": "Республика Адыгея",
    "amur-oblast": "Амурская область",
    "arkhangelsk": "Архангельская область",
    "astrakhan": "Астраханская область",
    "bashkortostan": "Республика Башкортостан",
    "belgorod": "Белгородская область",
    "bryansk": "Брянская область",
    "buryatia": "Республика Бурятия",
    "chechnya": "Чеченская Республика",
    "chelyabinsk": "Челябинская область",
    "chukotka": "Чукотский АО",
    "crimea": "Республика Крым",
    "chuvash": "Чувашская Республика",
    "dagestan": "Республика Дагестан",
    "donetsk": "Донецкая Народная Республика",
    "ingushetia": "Республика Ингушетия",
    "irkutsk": "Иркутская область",
    "ivanovo": "Ивановская область",
    "kamchatka": "Камчатский край",
    "kabardino-balkaria": "Кабардино-Балкарская Республика",
    "karachay-cherkessia": "Карачаево-Черкесская Республика",
    "krasnodar": "Краснодарский край",
    "kemerovo": "Кемеровская область",
    "kaliningrad": "Калининградская область",
    "kurgan": "Курганская область",
    "khabarovsk": "Хабаровский край",
    "khanty-mansiysk": "Ханты-Мансийский АО — Югра",
    "kirov": "Кировская область",
    "khakassia": "Республика Хакасия",
    "kalmykia": "Республика Калмыкия",
    "kaluga": "Калужская область",
    "komi": "Республика Коми",
    "kostroma": "Костромская область",
    "karelia": "Республика Карелия",
    "kursk": "Курская область",
    "krasnoyarsk": "Красноярский край",
    "leningrad-oblast": "Ленинградская область",
    "lipetsk": "Липецкая область",
    "lugansk": "Луганская Народная Республика",
    "magadan": "Магаданская область",
    "mari-el": "Республика Марий Эл",
    "mordovia": "Республика Мордовия",
    "moscow-oblast": "Московская область",
    "moscow-city": "Москва",
    "murmansk": "Мурманская область",
    "nenets": "Ненецкий АО",
    "novgorod": "Новгородская область",
    "nizhny-novgorod": "Нижегородская область",
    "novosibirsk": "Новосибирская область",
    "omsk": "Омская область",
    "orenburg": "Оренбургская область",
    "orlovskaya": "Орловская область",
    "perm-krai": "Пермский край",
    "penza": "Пензенская область",
    "primorsky": "Приморский край",
    "pskov": "Псковская область",
    "rostov": "Ростовская область",
    "ryazan": "Рязанская область",
    "sakha": "Республика Саха (Якутия)",
    "sakhalin": "Сахалинская область",
    "samara": "Самарская область",
    "saratov": "Саратовская область",
    "north-ossetia": "Республика Северная Осетия — Алания",
    "sevastopol": "Севастополь",
    "smolensk": "Смоленская область",
    "st-petersburg": "Санкт-Петербург",
    "stavropol": "Ставропольский край",
    "sverdlovsk": "Свердловская область",
    "tatarstan": "Республика Татарстан",
    "tambov": "Тамбовская область",
    "tomsk": "Томская область",
    "tula": "Тульская область",
    "tver": "Тверская область",
    "tuva": "Республика Тыва",
    "tyumen": "Тюменская область",
    "udmurt": "Удмуртская Республика",
    "ulyanovsk": "Ульяновская область",
    "volgograd": "Волгоградская область",
    "vladimir": "Владимирская область",
    "vologda": "Вологодская область",
    "voronezh": "Воронежская область",
    "yamalo-nenets": "Ямало-Ненецкий АО",
    "yaroslavl": "Ярославская область",
    "jewish-ao": "Еврейская АО",
    "zabaykalsky": "Забайкальский край",
    "kherson": "Херсонская область",
    "zaporozhye": "Запорожская область"
};

const regionTypes = {
    "altai-republic": "republic",
    "altai-krai": "krai",
    "adygeya": "republic",
    "amur-oblast": "oblast",
    "arkhangelsk": "oblast",
    "astrakhan": "oblast",
    "bashkortostan": "republic",
    "belgorod": "oblast",
    "bryansk": "oblast",
    "buryatia": "republic",
    "chechnya": "republic",
    "chelyabinsk": "oblast",
    "chukotka": "okrug",
    "crimea": "republic",
    "chuvash": "republic",
    "dagestan": "republic",
    "donetsk": "republic",
    "ingushetia": "republic",
    "irkutsk": "oblast",
    "ivanovo": "oblast",
    "kamchatka": "krai",
    "kabardino-balkaria": "republic",
    "karachay-cherkessia": "republic",
    "krasnodar": "krai",
    "kemerovo": "oblast",
    "kaliningrad": "oblast",
    "kurgan": "oblast",
    "khabarovsk": "krai",
    "khanty-mansiysk": "okrug",
    "kirov": "oblast",
    "khakassia": "republic",
    "kalmykia": "republic",
    "kaluga": "oblast",
    "komi": "republic",
    "kostroma": "oblast",
    "karelia": "republic",
    "kursk": "oblast",
    "krasnoyarsk": "krai",
    "leningrad-oblast": "oblast",
    "lipetsk": "oblast",
    "lugansk": "republic",
    "magadan": "oblast",
    "mari-el": "republic",
    "mordovia": "republic",
    "moscow-oblast": "oblast",
    "moscow-city": "federal-city",
    "murmansk": "oblast",
    "nenets": "okrug",
    "novgorod": "oblast",
    "nizhny-novgorod": "oblast",
    "novosibirsk": "oblast",
    "omsk": "oblast",
    "orenburg": "oblast",
    "orlovskaya": "oblast",
    "perm-krai": "krai",
    "penza": "oblast",
    "primorsky": "krai",
    "pskov": "oblast",
    "rostov": "oblast",
    "ryazan": "oblast",
    "sakha": "republic",
    "sakhalin": "oblast",
    "samara": "oblast",
    "saratov": "oblast",
    "north-ossetia": "republic",
    "sevastopol": "federal-city",
    "smolensk": "oblast",
    "st-petersburg": "federal-city",
    "stavropol": "krai",
    "sverdlovsk": "oblast",
    "tatarstan": "republic",
    "tambov": "oblast",
    "tomsk": "oblast",
    "tula": "oblast",
    "tver": "oblast",
    "tuva": "republic",
    "tyumen": "oblast",
    "udmurt": "republic",
    "ulyanovsk": "oblast",
    "volgograd": "oblast",
    "vladimir": "oblast",
    "vologda": "oblast",
    "voronezh": "oblast",
    "yamalo-nenets": "okrug",
    "yaroslavl": "oblast",
    "jewish-ao": "okrug",
    "zabaykalsky": "krai",
    "kherson": "oblast",
    "zaporozhye": "oblast"
};

// Custom color mapping for specific regions
const customRegionColors = {
    // Удмуртская Республика
    "udmurt": "#954036",
    
    // Челябинская, Свердловская, Курганская область и Пермский край
    "chelyabinsk": "#3d4c6d",
    "sverdlovsk": "#3d4c6d",
    "kurgan": "#3d4c6d",
    "perm-krai": "#3d4c6d",
    
    // Магаданская область
    "magadan": "#6c655d",
    
    // Калининградская область
    "kaliningrad": "#a24430",
    
    // Томская, Новосибирская область, Алтайский край, Республика Алтай
    "tomsk": "#9eabb3",
    "novosibirsk": "#9eabb3",
    "altai-krai": "#9eabb3",
    "altai-republic": "#9eabb3",
    
    // Мурманская, Ярославская, Владимирская, Московская, Калужская, Смоленская,
    // Псковская, Новгородская, Вологодская, Нижегородская, Костромская,
    // Архангельская, Липецкая, Белгородская, Ростовская область,
    // Республика Карелия, Чувашская республика, Республика Марий Эл,
    // Республика Коми, Ненецкий АО, Республика Крым
    "murmansk": "#587daa",
    "yaroslavl": "#587daa",
    "vladimir": "#587daa",
    "moscow-oblast": "#587daa",
    "kaluga": "#587daa",
    "smolensk": "#587daa",
    "pskov": "#587daa",
    "novgorod": "#587daa",
    "vologda": "#587daa",
    "nizhny-novgorod": "#587daa",
    "kostroma": "#587daa",
    "arkhangelsk": "#587daa",
    "lipetsk": "#587daa",
    "belgorod": "#587daa",
    "rostov": "#587daa",
    "karelia": "#587daa",
    "chuvash": "#587daa",
    "mari-el": "#587daa",
    "komi": "#587daa",
    "nenets": "#587daa",
    "crimea": "#587daa"
};

// Default color for all other regions
const DEFAULT_REGION_COLOR = "#bab2a7";

function getRegionColor(regionId, intensity = 0.5) {
    // Return custom color if defined, otherwise default
    if (customRegionColors[regionId]) {
        return customRegionColors[regionId];
    }
    return DEFAULT_REGION_COLOR;
}

function getTurnoutIntensity(regionId) {
    const data = electionData[regionId];
    if (!data) return 0.5;
    return Math.min(parseFloat(data.turnout) / 100, 1);
}

async function loadElectionData() {
    try {
        const response = await fetch('election-data.json');
        const data = await response.json();
        Object.assign(electionData, data);
        console.log('Loaded real election data for', Object.keys(data).length, 'regions');
    } catch (error) {
        console.error('Error loading election data:', error);
        generateMockData();
    }
}

function generateMockData() {
    Object.keys(regionNames).forEach(regionId => {
        const baseVoters = Math.floor(Math.random() * 500000) + 100000;
        const turnout = 0.6 + Math.random() * 0.35;
        const ballotsIssued = Math.floor(baseVoters * turnout);
        const voters = baseVoters;
        const invalidBallots = Math.floor(ballotsIssued * (0.01 + Math.random() * 0.03));
        const validBallots = ballotsIssued - invalidBallots;
        
        electionData[regionId] = {
            region: regionNames[regionId],
            ballotsIssued,
            voters,
            turnout: (turnout * 100).toFixed(2),
            invalidBallots,
            validBallots
        };
    });
}

// Region details (peoples, languages, cultural links, gallery)
let regionDetails = {};

async function loadRegionDetails() {
    try {
        const response = await fetch('region-details.json');
        regionDetails = await response.json();
        console.log('Loaded region details for', Object.keys(regionDetails).length, 'regions');
    } catch (error) {
        console.error('Error loading region details:', error);
    }
}

function getRegionDetails(ruCode) {
    return regionDetails[ruCode] || null;
}

window.electionData = electionData;
window.loadElectionData = loadElectionData;
window.loadRegionDetails = loadRegionDetails;
window.getRegionDetails = getRegionDetails;
window.regionCodeMap = regionCodeMap;
window.regionNames = regionNames;
window.regionTypes = regionTypes;
window.getRegionColor = getRegionColor;
window.getTurnoutIntensity = getTurnoutIntensity;