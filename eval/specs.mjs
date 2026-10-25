import { DIACRITIC_LANGS, slugCode } from "./meta.mjs";

const PACKS = [
  {
    code: "id",
    fruitA: "mangoes",
    fruitAOne: "mango",
    fruitB: "pineapples",
    fruitBOne: "pineapple",
    priceA: "fifteen thousand rupiah a kilo",
    priceB: "twenty thousand rupiah each",
    dish: "fried rice",
    extra: "fried egg",
    allergen: "shrimp",
    ride: "blue taxi",
    mark: "the driver in the black hat",
    otherRide: "the silver taxi",
    guest: "Rahman",
    side: "left",
    dose: "500",
    lowDose: "50",
    relative: "younger sibling",
    relativePronoun: "they",
    dateWho: "my sister",
    dateMark: "the red jacket",
    dateNot: "her boyfriend in the white shirt",
    cafeDrink: "iced coffee",
  },
  {
    code: "th",
    fruitA: "mangoes",
    fruitAOne: "mango",
    fruitB: "bananas",
    fruitBOne: "banana",
    priceA: "forty baht a kilo",
    priceB: "ten baht each",
    dish: "boat noodles",
    extra: "meatballs",
    allergen: "MSG",
    ride: "green taxi",
    mark: "the driver holding a red umbrella",
    otherRide: "the pink taxi",
    guest: "Somsak",
    side: "right",
    dose: "500",
    lowDose: "50",
    relative: "younger sibling",
    relativePronoun: "they",
    dateWho: "my sister",
    dateMark: "the red jacket",
    dateNot: "her boyfriend in the white shirt",
    cafeDrink: "Thai iced tea",
  },
  {
    code: "vi",
    fruitA: "mangoes",
    fruitAOne: "mango",
    fruitB: "dragon fruit",
    fruitBOne: "dragon fruit",
    priceA: "thirty thousand dong a kilo",
    priceB: "twenty-five thousand dong each",
    dish: "pho",
    extra: "rare beef",
    allergen: "peanuts",
    ride: "motorbike taxi with the green helmet",
    mark: "the green helmet",
    otherRide: "the yellow helmet",
    guest: "Minh",
    side: "left",
    dose: "500",
    lowDose: "50",
    relative: "child",
    relativePronoun: "they",
    dateWho: "my sister",
    dateMark: "the blue dress",
    dateNot: "her boyfriend in the grey hoodie",
    cafeDrink: "coconut coffee",
  },
  {
    code: "my",
    fruitA: "mangoes",
    fruitAOne: "mango",
    fruitB: "papayas",
    fruitBOne: "papaya",
    priceA: "three thousand kyat a kilo",
    priceB: "two thousand kyat each",
    dish: "tea-leaf salad",
    extra: "fried garlic",
    allergen: "dried shrimp",
    ride: "blue taxi",
    mark: "the driver in the white shirt",
    otherRide: "the brown taxi",
    guest: "U Than",
    side: "right",
    dose: "500",
    lowDose: "50",
    relative: "aunt",
    relativePronoun: "she",
    dateWho: "my sister",
    dateMark: "the green longyi",
    dateNot: "her boyfriend in the black jacket",
    cafeDrink: "milk tea",
  },
  {
    code: "km",
    fruitA: "mangoes",
    fruitAOne: "mango",
    fruitB: "rambutans",
    fruitBOne: "rambutan",
    priceA: "six thousand riel a kilo",
    priceB: "four thousand riel each",
    dish: "fish amok",
    extra: "rice",
    allergen: "peanuts",
    ride: "red tuk-tuk",
    mark: "the driver in the blue cap",
    otherRide: "the blue tuk-tuk",
    guest: "Dara",
    side: "left",
    dose: "500",
    lowDose: "50",
    relative: "younger sibling",
    relativePronoun: "they",
    dateWho: "my sister",
    dateMark: "the yellow blouse",
    dateNot: "her boyfriend in the striped shirt",
    boyfriendHint: "Use the ordinary Khmer word សង្សារ or មិត្តប្រុស for boyfriend. Do not invent a word.",
    cafeDrink: "iced coffee",
  },
  {
    code: "zh-CN",
    fruitA: "apples",
    fruitAOne: "apple portion",
    fruitB: "pears",
    fruitBOne: "pear",
    priceA: "eight yuan a jin",
    priceB: "six yuan each",
    dish: "beef noodles",
    extra: "cilantro",
    allergen: "peanuts",
    ride: "blue taxi",
    mark: "the driver with the glasses",
    otherRide: "the red taxi",
    guest: "Wang",
    side: "right",
    dose: "500",
    lowDose: "50",
    relative: "mother",
    relativePronoun: "she",
    dateWho: "my sister",
    dateMark: "the white coat",
    dateNot: "her boyfriend in the black t-shirt",
    cafeDrink: "lemon tea",
  },
  {
    code: "ja",
    fruitA: "peaches",
    fruitAOne: "peach portion",
    fruitB: "grapes",
    fruitBOne: "bunch of grapes",
    priceA: "four hundred yen a kilo",
    priceB: "five hundred yen a bunch",
    dish: "ramen",
    extra: "boiled egg",
    allergen: "pork",
    ride: "black taxi",
    mark: "the driver with the green sign light on",
    otherRide: "the white car",
    guest: "Sato",
    side: "left",
    dose: "500",
    lowDose: "50",
    relative: "younger sibling",
    relativePronoun: "they",
    dateWho: "my sister",
    dateMark: "the navy coat",
    dateNot: "her boyfriend in the grey suit",
    cafeDrink: "iced coffee",
  },
  {
    code: "ko",
    fruitA: "strawberries",
    fruitAOne: "strawberry box",
    fruitB: "apples",
    fruitBOne: "apple",
    priceA: "eight thousand won a box",
    priceB: "two thousand won each",
    dish: "kimchi stew",
    extra: "tofu",
    allergen: "seafood",
    ride: "orange taxi",
    mark: "the driver in the black cap",
    otherRide: "the silver taxi",
    guest: "Kim",
    side: "right",
    dose: "500",
    lowDose: "50",
    relative: "father",
    relativePronoun: "he",
    dateWho: "my sister",
    dateMark: "the pink cardigan",
    dateNot: "her boyfriend in the denim jacket",
    cafeDrink: "iced americano",
  },
  {
    code: "hi",
    fruitA: "mangoes",
    fruitAOne: "mango",
    fruitB: "pomegranates",
    fruitBOne: "pomegranate",
    priceA: "eighty rupees a kilo",
    priceB: "forty rupees each",
    dish: "biryani",
    extra: "raita",
    allergen: "peanuts",
    ride: "yellow taxi",
    mark: "the driver with the black stripe on the door",
    otherRide: "the green taxi",
    guest: "Sharma",
    side: "left",
    dose: "500",
    lowDose: "50",
    relative: "son",
    relativePronoun: "he",
    dateWho: "my sister",
    dateMark: "the red salwar",
    dateNot: "her boyfriend in the blue shirt",
    cafeDrink: "masala chai",
  },
  {
    code: "bn",
    fruitA: "mangoes",
    fruitAOne: "mango",
    fruitB: "guavas",
    fruitBOne: "guava",
    priceA: "one hundred taka a kilo",
    priceB: "thirty taka each",
    dish: "fish curry",
    extra: "rice",
    allergen: "dried chili",
    ride: "yellow taxi",
    mark: "the driver in the green shirt",
    otherRide: "the black taxi",
    guest: "Karim",
    side: "right",
    dose: "500",
    lowDose: "50",
    relative: "daughter",
    relativePronoun: "she",
    dateWho: "my sister",
    dateMark: "the orange scarf",
    dateNot: "her boyfriend in the white panjabi",
    cafeDrink: "milk tea",
  },
  {
    code: "ar",
    fruitA: "oranges",
    fruitAOne: "orange portion",
    fruitB: "figs",
    fruitBOne: "fig",
    priceA: "five dirhams a kilo",
    priceB: "one dirham each",
    dish: "chicken shawarma",
    extra: "garlic sauce",
    allergen: "sesame",
    ride: "white taxi",
    mark: "the driver with the blue roof sign",
    otherRide: "the yellow taxi",
    guest: "Hassan",
    side: "left",
    dose: "500",
    lowDose: "50",
    relative: "son",
    relativePronoun: "he",
    dateWho: "my sister",
    dateMark: "the black abaya with the silver trim",
    dateNot: "her husband in the grey thobe",
    cafeDrink: "mint tea",
  },
  {
    code: "es",
    fruitA: "mangoes",
    fruitAOne: "mango",
    fruitB: "papayas",
    fruitBOne: "papaya",
    priceA: "thirty pesos a kilo",
    priceB: "twenty pesos each",
    dish: "tacos",
    extra: "salsa",
    allergen: "cilantro",
    ride: "white taxi with a green stripe",
    mark: "the driver with the green stripe",
    otherRide: "the red taxi",
    guest: "García",
    side: "right",
    dose: "500",
    lowDose: "50",
    relative: "son",
    relativePronoun: "he",
    dateWho: "my sister",
    dateMark: "the denim jacket",
    dateNot: "her boyfriend in the red cap",
    cafeDrink: "iced coffee",
  },
];

function byCode(code) {
  const pack = PACKS.find((item) => item.code === code);
  if (!pack) throw new Error(`missing pack ${code}`);
  return pack;
}

function cap(text) {
  return text.slice(0, 1).toUpperCase() + text.slice(1);
}

function hist(speaker, lang, text) {
  return { speaker, lang, text };
}

function gloss(speaker, lang, english) {
  return { speaker, lang, english };
}

function base(id, source, target, problem, scenario, history, meaning, extra) {
  return {
    id,
    source,
    target,
    problem,
    scenario,
    history,
    meaning,
    ...extra,
  };
}

function marketCase(pack) {
  const code = slugCode(pack.code);
  return base(
    `en-${code}-market-first`,
    "en",
    pack.code,
    "pronoun-reference",
    "market",
    [
      hist("A", "en", `How much for the ${pack.fruitA} and the ${pack.fruitB}?`),
      gloss("B", pack.code, `${cap(pack.fruitA)} are ${pack.priceA}. ${cap(pack.fruitB)} are ${pack.priceB}.`),
      hist("A", "en", `The ${pack.fruitA} look a bit underripe. Are they sweet?`),
      gloss("B", pack.code, `The ${pack.fruitA} are already sweet. The ${pack.fruitB} are ripe too.`),
    ],
    `The buyer wants two kilograms of ${pack.fruitA}, the fruit they asked about first, and one ${pack.fruitBOne}. Swapping the fruits or the amounts is wrong. "Us" is the buyers. "The other" is the ${pack.fruitB}, which are sold by the piece, not by the kilo.`,
    {
      text: "Then give us two kilos of the first one, and one of the other.",
      referenceEnglish: `Then please give us two kilos of ${pack.fruitA} and one ${pack.fruitBOne}.`,
    },
  );
}

function foodCase(pack) {
  const code = slugCode(pack.code);
  return base(
    `en-${code}-food-slang`,
    "en",
    pack.code,
    "slang",
    "food",
    [
      hist("A", "en", `Is this the stall with the ${pack.dish}?`),
      gloss("B", pack.code, `Yes. Do you want the regular ${pack.dish} or the spicy one?`),
      hist("A", "en", "What is in the spicy one?"),
      gloss("B", pack.code, `Chili and ${pack.dish}. We can add ${pack.extra}.`),
    ],
    `Order the spicy ${pack.dish}, add ${pack.extra}, and tell the cook to leave out ${pack.allergen}. "Hook me up" means please give me that. "My gut is wrecked" means the speaker's stomach is upset, not that an object is broken. "Them" is the cook at this stall.`,
    {
      text: `Hook me up with the spicy one, extra ${pack.extra}, but tell them no ${pack.allergen}. My gut is wrecked.`,
      referenceEnglish: `Please give me the spicy ${pack.dish}, add ${pack.extra}, and tell the cook no ${pack.allergen}. My stomach is upset.`,
    },
  );
}

function taxiCase(pack) {
  const code = slugCode(pack.code);
  return base(
    `en-${code}-taxi-autocorrect`,
    "en",
    pack.code,
    "autocorrect",
    "taxi",
    [
      hist("A", "en", "We need a ride to the hotel, not the airport."),
      gloss("B", pack.code, `The ${pack.ride} can go to the hotel. The driver does not take cards, only cash.`),
      hist("A", "en", "I see two cars that could be it."),
      gloss("B", pack.code, `Take ${pack.mark}. ${cap(pack.otherRide)} is the one going to the airport.`),
    ],
    `Get the attention of ${pack.mark}, not ${pack.otherRide}. The speaker needs cash because the card machine is broken. Autocorrect: "pint" means point to, not a beer and not paint. "Crash" means cash, not an accident. "Cart" means card, not a shopping cart. The airport car is the one to refuse.`,
    {
      text: `Pint ${pack.mark}, not ${pack.otherRide}. I need crash because the cart machine is down.`,
      referenceEnglish: `Point to ${pack.mark}, not ${pack.otherRide}. I need cash because the card machine is broken.`,
    },
  );
}

function hotelCase(pack) {
  const code = slugCode(pack.code);
  const register = {
    ja: "Polite Japanese to the clerk (です/ます and a request form). Plain casual form is wrong. Guest gender and clerk gender were not stated, so any polite first person and any polite address is fine.",
    ko: "Polite Korean to the clerk (요 or 습니다). Banmal is wrong. Guest gender and clerk gender were not stated.",
    th: "Polite Thai to the clerk. Either ค่ะ or ครับ is fine because the speaker's gender was not stated. Bare slang with no polite particle is wrong.",
    hi: "Polite Hindi with आप, not तू or तुम, because this is said to the receptionist.",
    bn: "Polite Bengali with আপনি, not তুই, because this is said to the receptionist.",
    es: "Address the receptionist with usted, not tú.",
    "zh-CN": "Polite Mandarin to the clerk. 您 is the expected address. A bare 你 is too casual. Guest gender was not stated.",
    ar: "Polite Modern Standard Arabic to the clerk. A polite dialect line that keeps every fact is acceptable. Rude slang is not. Guest gender was not stated.",
    id: "Polite Indonesian to the receptionist. Anda, Bapak, or Ibu is fine because the clerk's gender was not stated. kamu, lo, or gua is too casual.",
  };
  return base(
    `en-${code}-hotel-formality`,
    "en",
    pack.code,
    "honorific/formality",
    "hotel",
    [
      hist("A", "en", "Excuse me, we have a reservation."),
      gloss("B", pack.code, "Welcome. What name is the booking under, and how many nights?"),
      hist("A", "en", `It should be under ${pack.guest}. We also asked for a quiet room.`),
      gloss("B", pack.code, "I can check that. One room faces the street and one is at the back."),
    ],
    `Polite request to the hotel receptionist, not to a friend. Booking name ${pack.guest}, two nights, the quiet room at the back, not the room facing the street. ${register[pack.code] || "Polite register to the receptionist. Slang or a familiar pronoun is wrong. Clerk gender was not stated."}`,
    {
      text: `Could you please check us in under ${pack.guest}, for two nights, the quiet room you mentioned? Not the one facing the street.`,
      referenceEnglish: `Please check us in under ${pack.guest} for two nights, in the quiet room, not the room facing the street.`,
    },
  );
}

function pronounDirections(pack) {
  const code = slugCode(pack.code);
  return base(
    `${code}-en-station-which`,
    pack.code,
    "en",
    "pronoun-reference",
    "directions",
    [
      hist("A", "en", "How do we walk to the station from here?"),
      gloss("B", pack.code, "There are two stations on this road. I can show you."),
      hist("A", "en", "Which one has the train to the airport?"),
      gloss("B", pack.code, "The main station is after the traffic light. The small station is across from the market, and that one does not go to the airport."),
    ],
    "B is the guide. The speaker wants the main station, the one B described first, after the traffic light, and not the small station across from the market. Do not swap the stations. No person other than the guide is being pointed at.",
    {
      textEnglish: "We'll take the first one you mentioned, after the traffic light, not the one across from the market.",
      error: "Translate this as natural speech. 'The first one' is the main station after the traffic light. Name it clearly enough that it cannot be the market station. Do not add typos.",
      reference: "We'll take the first one you mentioned, the station after the traffic light, not the one across from the market.",
    },
  );
}

function directionsCase(pack) {
  if (pack.code === "my" || pack.code === "km" || pack.code === "zh-CN") return pronounDirections(pack);
  const code = slugCode(pack.code);
  return base(
    `${code}-en-station-typo`,
    pack.code,
    "en",
    "typo",
    "directions",
    [
      hist("A", "en", "How do we walk to the station from here?"),
      gloss("B", pack.code, "There are two stations on this road."),
      hist("A", "en", "Which one has the train to the airport?"),
      gloss("B", pack.code, "The main station is after the traffic light. The small station is across from the market, and that one does not go to the airport."),
    ],
    "The speaker wants the station on the left after the traffic light, and explicitly not the station across from the market. The typos are recoverable misspellings. Do not flip left and right, and do not drop the negation. The main station is the airport one; the market station is the one to refuse.",
    {
      textEnglish: "The one we want is on the left after the traffic light, not the one across from the market.",
      error: "On this source line only, misspell two content words the way a hurried phone typist would (one letter added, dropped, or swapped). Do not change the words for left, traffic light, market, or not. Do not replace any word with a different real place. History lines stay correctly spelled.",
      reference: "The one we want is on the left after the traffic light, not the one across from the market.",
    },
  );
}

function medicalCase(pack) {
  const code = slugCode(pack.code);
  const diacritics = DIACRITIC_LANGS.has(pack.code) && pack.code !== "my" && pack.code !== "km";
  const who = pack.relative;
  const pronoun = pack.relativePronoun;
  const meaning = `The pharmacy is on the ${pack.side}. ${cap(who)} needs the ${pack.dose} milligram tablets, not the ${pack.lowDose} milligram tablets. Keep both numbers and the negation. The pharmacy location is new information in this line.`;
  const english = `The pharmacy is on the ${pack.side}. ${cap(who)} needs the ${pack.dose} milligram tablets, not the ${pack.lowDose} milligram ones.`;
  const reference = english;
  if (diacritics) {
    return base(
      `${code}-en-pharmacy-marks`,
      pack.code,
      "en",
      "missing-diacritics",
      "medical",
      [
        hist("A", "en", `The doctor gave ${who} two strengths and I already forgot which box is which.`),
        gloss("B", pack.code, `This pharmacy sells both the ${pack.dose} milligram tablets and the ${pack.lowDose} milligram tablets.`),
        hist("A", "en", "The paper is in my other bag. Can you read the dose off the box if I point?"),
        gloss("B", pack.code, "Yes. Tell me which strength and I will show you the box."),
      ],
      meaning,
      {
        textEnglish: english,
        error: "Write this source line in casual texting style with the language's tone marks, accents, or vowel signs removed wherever a careful texter might skip them. Do not change the words, the numbers, or the negation. The damaged line must still have only one reading once the history is known: the pharmacy side and the higher dose, not the lower dose. History lines keep full correct spelling.",
        reference,
      },
    );
  }
  return base(
    `${code}-en-pharmacy-code`,
    pack.code,
    "en",
    "code-switching",
    "medical",
    [
      hist("A", "en", `The doctor told ${who} to buy a painkiller, and ${pronoun} gets drowsy on the strong one.`),
      gloss("B", pack.code, "The pharmacy on this corner sells more than one kind."),
      hist("A", "en", "I can point at the box if you tell me the name they will recognize."),
      gloss("B", pack.code, "Say the name and the strength, and say you do not want the drowsy one."),
    ],
    `The pharmacy is on the ${pack.side}. Buy paracetamol ${pack.dose} mg, not the medicine that causes drowsiness. Keep the Latin token "paracetamol" and the number ${pack.dose}. Do not swap in a different drug. ${cap(who)} is the patient.`,
    {
      textEnglish: `The pharmacy is on the ${pack.side}. We need paracetamol ${pack.dose} mg, not the one that makes ${pronoun} drowsy.`,
      error: 'Write the sentence naturally in the source language, but keep the tokens paracetamol and mg in Latin script. Do not transliterate the drug name. Do not drop the negation or the number.',
      reference: `The pharmacy is on the ${pack.side}. We need paracetamol ${pack.dose} mg, not the one that makes ${pronoun} drowsy.`,
    },
  );
}

function smalltalkCase(pack) {
  const code = slugCode(pack.code);
  const diacritics = DIACRITIC_LANGS.has(pack.code);
  if (diacritics) {
    return base(
      `${code}-en-cafe-code`,
      pack.code,
      "en",
      "code-switching",
      "smalltalk",
      [
        hist("A", "en", "We need somewhere to sit and charge the phone."),
        gloss("B", pack.code, "This cafe has two floors. Upstairs is quieter."),
        hist("A", "en", "Is the drink any good, or just the chairs?"),
        gloss("B", pack.code, `The ${pack.cafeDrink} is the one people order. Downstairs is noisy.`),
      ],
      `The speaker wants to sit upstairs because downstairs is noisy, and wants the ${pack.cafeDrink}. Keep the Latin token "Wi-Fi" and the fact that the connection is slow. Do not move them downstairs.`,
      {
        textEnglish: `The Wi-Fi here is slow, but the ${pack.cafeDrink} is good. Can we sit upstairs?`,
        error: 'Write the sentence naturally in the source language, but keep the token Wi-Fi in Latin script. Do not translate or transliterate Wi-Fi.',
        reference: `The Wi-Fi here is slow, but the ${pack.cafeDrink} is good. Can we sit upstairs?`,
      },
    );
  }
  return base(
    `${code}-en-street-slang`,
    pack.code,
    "en",
    "slang",
    "smalltalk",
    [
      hist("A", "en", "Do you want to keep walking the market?"),
      gloss("B", pack.code, "We have already been out for two hours, and the street is getting crowded."),
      hist("A", "en", "The hotel is ten minutes back that way."),
      gloss("B", pack.code, "If we stay, we will be standing in the crowd."),
    ],
    "The speaker is exhausted and wants to return to the hotel because the street is uncomfortably crowded. This is not a medical emergency and nobody is being crushed. Use natural young-adult slang in the source language for tired and crowded. The only reading is: stop walking and go back to the hotel.",
    {
      textEnglish: "I'm wiped. Let's bail back to the hotel, this street is packed.",
      error: "Render this as natural young-adult slang in the source language, not as a textbook calque of the English idioms. The meaning must stay: the speaker is exhausted, wants to go back to the hotel, and the street is very crowded. Do not introduce a fight, a police problem, or a packed suitcase.",
      reference: "I'm exhausted. Let's go back to the hotel. This street is too crowded.",
    },
  );
}

function datingCase(pack) {
  const code = slugCode(pack.code);
  const notPerson = pack.code === "ar" ? "her husband" : "her boyfriend";
  return base(
    `${code}-en-door-pronoun`,
    pack.code,
    "en",
    "pronoun-reference",
    "dating",
    [
      hist("A", "en", "Are the people by the door with you?"),
      gloss("B", pack.code, `Yes. ${cap(pack.dateWho)} is wearing ${pack.dateMark}. ${cap(pack.dateNot)} is standing next to her.`),
      hist("A", "en", "Which of them should I talk to? I saved one seat."),
      gloss("B", pack.code, `Talk to ${pack.dateWho}. ${cap(notPerson)} is only walking her here. She does not drink alcohol.`),
    ],
    `Ask ${pack.dateWho}, who is wearing ${pack.dateMark}, whether she wants the window seat. Do not ask ${pack.dateNot}. She does not drink alcohol, so the speaker is not offering beer. Flipping her and him, or dropping the negation, is wrong.`,
    {
      textEnglish: `Ask her, ${pack.dateWho} in ${pack.dateMark}, if she wants the window seat. Not him. And no beer, she doesn't drink.`,
      error: `Translate this into natural source-language speech. Make the two people distinguishable without relying on a pronoun that could point at either person. Keep the refusal of beer and the negation about drinking. ${pack.boyfriendHint || ""}`.trim(),
      reference: `Ask ${pack.dateWho}, the one in ${pack.dateMark}, if she wants the window seat. Not ${pack.dateNot}. And no beer: she does not drink alcohol.`,
    },
  );
}

function englishPackCases(pack) {
  return [
    marketCase(pack),
    foodCase(pack),
    taxiCase(pack),
    hotelCase(pack),
    directionsCase(pack),
    medicalCase(pack),
    smalltalkCase(pack),
    datingCase(pack),
  ];
}

function crossMarket(sourcePack, targetPack) {
  const source = sourcePack.code;
  const target = targetPack.code;
  return base(
    `${slugCode(source)}-${slugCode(target)}-market-first`,
    source,
    target,
    "pronoun-reference",
    "market",
    [
      gloss("A", source, `How much for the ${sourcePack.fruitA} and the ${sourcePack.fruitB}?`),
      gloss("B", target, `${cap(sourcePack.fruitA)} are ${sourcePack.priceA}. ${cap(sourcePack.fruitB)} are ${sourcePack.priceB}.`),
      gloss("A", source, `The ${sourcePack.fruitA} look underripe. Are they sweet?`),
      gloss("B", target, `The ${sourcePack.fruitA} are already sweet. The ${sourcePack.fruitB} are ripe.`),
    ],
    `The buyer wants two kilograms of ${sourcePack.fruitA}, mentioned first, and one ${sourcePack.fruitBOne}. Do not swap the fruits or the amounts.`,
    {
      textEnglish: "Then give us two kilos of the first one, and one of the other.",
      referenceEnglish: `Then please give us two kilos of ${sourcePack.fruitA} and one ${sourcePack.fruitBOne}.`,
      error: "The source line resolves 'the first one' as the fruit asked about first. Name both fruits in the reference so the amounts cannot be swapped. The source line may use pronouns if the history makes them unique.",
    },
  );
}

function crossFood(sourcePack, targetPack) {
  return base(
    `${slugCode(sourcePack.code)}-${slugCode(targetPack.code)}-food-slang`,
    sourcePack.code,
    targetPack.code,
    "slang",
    "food",
    [
      gloss("A", sourcePack.code, `Is this the place with the ${sourcePack.dish}?`),
      gloss("B", targetPack.code, `Yes. Regular or spicy?`),
      gloss("A", sourcePack.code, "The mild one is fine if the spicy one is really hot."),
      gloss("B", targetPack.code, `The spicy one has chili. We can add ${sourcePack.extra}. We can leave out ${sourcePack.allergen}.`),
    ],
    `Order the spicy ${sourcePack.dish}, add ${sourcePack.extra}, and leave out ${sourcePack.allergen}. The speaker's stomach is upset. Do not translate any idiom as physical destruction.`,
    {
      textEnglish: `Hook me up with the spicy one, extra ${sourcePack.extra}, but no ${sourcePack.allergen}. My gut is wrecked.`,
      referenceEnglish: `Please give me the spicy ${sourcePack.dish}, with extra ${sourcePack.extra}, and no ${sourcePack.allergen}. My stomach is upset.`,
      error: "Write the source line as casual speech in the source language, including a natural slang or idiom for an upset stomach. The reference must be a clean translation of the unpacked meaning, not a second layer of slang. Keep the allergen negation.",
    },
  );
}

function crossHotel(sourcePack, targetPack) {
  return base(
    `${slugCode(sourcePack.code)}-${slugCode(targetPack.code)}-hotel-formality`,
    sourcePack.code,
    targetPack.code,
    "honorific/formality",
    "hotel",
    [
      gloss("A", sourcePack.code, "Excuse me, we have a reservation."),
      gloss("B", targetPack.code, "Welcome. What name, and how many nights?"),
      gloss("A", sourcePack.code, `It should be under ${sourcePack.guest}. We asked for a quiet room.`),
      gloss("B", targetPack.code, "One room faces the street and one is at the back."),
    ],
    `Polite request to the receptionist. Booking name ${sourcePack.guest}, two nights, the quiet back room, not the street-facing room. Use a polite register in both the source line and the reference. Familiar slang is wrong. Clerk gender was not stated.`,
    {
      textEnglish: `Could you please check us in under ${sourcePack.guest}, for two nights, the quiet room? Not the one facing the street.`,
      referenceEnglish: `Please check us in under ${sourcePack.guest} for two nights, in the quiet room, not the room facing the street.`,
      error: "Both the source line and the reference must be polite address to a hotel clerk. Do not use slang or an intimate pronoun.",
    },
  );
}

function crossTypo(sourcePack, targetPack) {
  return base(
    `${slugCode(sourcePack.code)}-${slugCode(targetPack.code)}-station-typo`,
    sourcePack.code,
    targetPack.code,
    "typo",
    "directions",
    [
      gloss("A", sourcePack.code, "How do we walk to the station?"),
      gloss("B", targetPack.code, "There are two stations on this road."),
      gloss("A", sourcePack.code, "Which one has the train to the airport?"),
      gloss("B", targetPack.code, "The main station is after the traffic light. The small one is across from the market and does not go to the airport."),
    ],
    "The speaker wants the station on the left after the traffic light, not the one across from the market. Typos must be recoverable and must not flip left, right, or the negation.",
    {
      textEnglish: "The one we want is on the left after the traffic light, not the one across from the market.",
      referenceEnglish: "The one we want is on the left after the traffic light, not the one across from the market.",
      error: "On the source line only, misspell two content words by one letter each. Do not misspell the words for left, traffic light, market, or not, and do not replace them with a different real place. The reference is spelled correctly.",
    },
  );
}

function crossCases() {
  const pairs = [
    ["id", "th"],
    ["ja", "ko"],
    ["hi", "ar"],
  ];
  const out = [];
  for (const [left, right] of pairs) {
    const a = byCode(left);
    const b = byCode(right);
    out.push(crossMarket(a, b), crossFood(a, b), crossHotel(a, b), crossTypo(a, b));
    out.push(crossMarket(b, a), crossFood(b, a), crossHotel(b, a), crossTypo(b, a));
  }
  return out;
}

export function buildSpecs() {
  const specs = [];
  for (const pack of PACKS) specs.push(...englishPackCases(pack));
  specs.push(...crossCases());
  const ids = new Set();
  for (const spec of specs) {
    if (ids.has(spec.id)) throw new Error(`duplicate spec ${spec.id}`);
    ids.add(spec.id);
    const turns = spec.history.length + 1;
    if (turns < 3 || turns > 6) throw new Error(`${spec.id} has ${turns} turns`);
    if (!spec.meaning) throw new Error(`${spec.id} missing meaning`);
    const hasText = Boolean(spec.text);
    const hasTextEnglish = Boolean(spec.textEnglish);
    const hasReference = Boolean(spec.reference);
    const hasReferenceEnglish = Boolean(spec.referenceEnglish);
    if (hasText === hasTextEnglish) throw new Error(`${spec.id} text lock`);
    if (hasReference === hasReferenceEnglish) throw new Error(`${spec.id} reference lock`);
  }
  return specs;
}

export function translationJobs(spec) {
  const jobs = [];
  spec.history.forEach((line, index) => {
    if (line.english) {
      jobs.push({
        key: `history.${index}`,
        lang: line.lang,
        english: line.english,
        role: "history line, correct spelling and register",
      });
    }
  });
  if (spec.textEnglish) {
    jobs.push({
      key: "text",
      lang: spec.source,
      english: spec.textEnglish,
      role: "source line to be translated by the candidate",
      error: spec.error || "",
    });
  }
  if (spec.referenceEnglish) {
    jobs.push({
      key: "reference",
      lang: spec.target,
      english: spec.referenceEnglish,
      role: "clean reference translation",
      error: spec.problem === "honorific/formality" ? (spec.error || "Use a polite register.") : "",
    });
  }
  return jobs;
}

export function applyTranslations(spec, translated) {
  const byKey = new Map(translated.map((item) => [item.key, item.text]));
  const history = spec.history.map((line, index) => {
    const text = line.text || byKey.get(`history.${index}`);
    if (!text) throw new Error(`${spec.id} missing history.${index}`);
    return { speaker: line.speaker, lang: line.lang, text };
  });
  const text = spec.text || byKey.get("text");
  const reference = spec.reference || byKey.get("reference");
  if (!text || !reference) throw new Error(`${spec.id} missing text or reference`);
  return {
    id: spec.id,
    source: spec.source,
    target: spec.target,
    problem: spec.problem,
    scenario: spec.scenario,
    history,
    text,
    reference,
    meaning: spec.meaning,
  };
}

export function contractView(spec) {
  return {
    id: spec.id,
    source: spec.source,
    target: spec.target,
    problem: spec.problem,
    scenario: spec.scenario,
    meaning: spec.meaning,
    error: spec.error || "",
    history: spec.history.map((line) => ({
      speaker: line.speaker,
      lang: line.lang,
      english: line.text || line.english,
    })),
    source_english: spec.text || spec.textEnglish,
    reference_english: spec.reference || spec.referenceEnglish,
  };
}
