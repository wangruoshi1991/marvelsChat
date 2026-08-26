const uniqueTerms = (values, maximum = 12) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, maximum);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const englishName = "[A-Z][A-Za-z'’-]{1,79}(?:\\s+[A-Z][A-Za-z'’-]{1,79}){0,3}";
const chineseName = "[\\p{Script=Han}]{2,3}";
const chineseSurname = "[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程邢裴陆荣翁荀羊於惠甄曲家封芮储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘厉戎祖武符刘景詹龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公]";

const controlledVisualEnglishWords = new Set([
  "a", "an", "and", "at", "beach", "beside", "black", "blue", "by", "child", "color",
  "dress", "find", "for", "from", "green", "holding", "image", "in", "man", "near", "of",
  "on", "outdoor", "person", "photo", "picture", "red", "running", "search", "shirt", "sitting",
  "standing", "summer", "the", "to", "video", "wearing", "white", "winter", "with", "woman",
  "yellow",
]);

const markedIdentityPatterns = () => [
  new RegExp(`\\b(?:celebrity|actor|actress|singer|character|nickname|named)\\s+["“']?(${englishName})`, "gu"),
  new RegExp(`(?:叫|名为|名字是|姓名是|明星|演员|歌手|角色|昵称)\\s*["“'「]?\\s*(${chineseName})(?:的?人)?(?=(?:穿|在|是|有|照片|图片|$))`, "gu"),
];

const unmarkedEnglishProperNounPattern = () => new RegExp(`\\b(${englishName})\\b`, "gu");

const unmarkedChineseContextPatterns = () => [
  new RegExp(`(?:照片里|照片中|图片里|图片中|图里|图中|画面里|画面中|视频里|视频中)\\s*(${chineseSurname}[\\p{Script=Han}]{1,2})(?=(?:穿|在|是|有|正|正在|和|站|坐|跑|走|拿|举|戴))`, "gu"),
  new RegExp(`(?:^|[\\s，,。！？!?；;、])(${chineseSurname}[\\p{Script=Han}]{1,2})(?=(?:穿|在|的|是|有|正在|和|站|坐|跑|走|拿|举|戴))`, "gu"),
];

const isControlledVisualEnglishPhrase = (value) =>
  String(value || "")
    .split(/\\s+/u)
    .filter(Boolean)
    .every((word) => controlledVisualEnglishWords.has(word.toLocaleLowerCase()));

// This deliberately detects only explicit, high-confidence identity markers.
// Ambiguous unmarked names cannot safely be inferred by a deterministic parser.
export function collectMarkedIdentityTerms(input) {
  const text = String(input || "").slice(0, 240);
  const matches = [];
  for (const pattern of markedIdentityPatterns()) {
    for (const match of text.matchAll(pattern)) matches.push(match[1]);
  }
  return uniqueTerms(matches);
}

// A false negative here could put a personal identity into a visual embedding.
// The patterns intentionally choose exact-text-only for plausible references.
export function collectIdentityReferences(input) {
  const text = String(input || "").normalize("NFKC").slice(0, 240);
  const marked = collectMarkedIdentityTerms(text);
  const unmarked = [];
  for (const match of text.matchAll(unmarkedEnglishProperNounPattern())) {
    if (match[1] && !isControlledVisualEnglishPhrase(match[1])) unmarked.push(match[1]);
  }
  for (const pattern of unmarkedChineseContextPatterns()) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) unmarked.push(match[1]);
    }
  }
  const markedKeys = new Set(marked.map((term) => term.toLocaleLowerCase()));
  const unresolvedUnmarked = unmarked.filter((term) => !markedKeys.has(term.toLocaleLowerCase()));
  const terms = uniqueTerms([...marked, ...unmarked]);
  return {
    terms,
    explicit: marked.length > 0,
    // An explicitly marked identity is removed deterministically before any
    // embedding. Only a reference without that proven removal forces the
    // whole query into exact-only mode.
    ambiguous: unresolvedUnmarked.length > 0,
  };
}

export function removeIdentityTerms(value, terms) {
  let result = String(value || "");
  for (const pattern of markedIdentityPatterns()) {
    result = result.replace(pattern, " ");
  }
  for (const term of uniqueTerms(terms)) {
    result = result.replace(new RegExp(escapeRegExp(term), "gi"), " ");
  }
  return result.replace(/\s+/g, " ").trim().slice(0, 240);
}

export function hasEquivalentIdentityTerm(terms, candidate) {
  const normalized = String(candidate || "").trim().toLocaleLowerCase();
  return uniqueTerms(terms).some((term) => term.toLocaleLowerCase() === normalized);
}
