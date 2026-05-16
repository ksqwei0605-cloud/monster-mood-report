export const yaoyaoData = {
  monster: {
    name: "拖拖团",
    type: "深夜内耗型小妖怪",
    emoji: "🦄",
    color: "#f8b6d2",
    attributes: [
      { label: "出没时段", value: "深夜 23:00" },
      { label: "食物偏好", value: "焦虑味薯片、拖延味奶茶" },
      { label: "今日技能", value: "假装自律、边摆边卷" },
      { label: "性格特征", value: "嘴上摆烂，心里偷偷着急" },
    ],
    intro: "看看小妖怪叼来了什么",
  },
  mbtiMix: [
    { type: "INFP", percent: 35, color: "#f8b6d2", cute: "小脑袋里装满想法的小蘑菇型人格" },
    { type: "ENFP", percent: 25, color: "#ffd98a", cute: "到处发光但偶尔电量不足的小太阳人格" },
    { type: "INTJ", percent: 20, color: "#b6c8f8", cute: "表面冷静，内心偷偷规划全局的小军师人格" },
    { type: "ISFP", percent: 20, color: "#cdb6f8", cute: "安静观察世界的小猫爪人格" },
  ],
  energyScore: 42,
  emotionText: "今天是软趴趴云朵心情，适合慢慢来",
  videoAnalysis: [
    { icon: "⏰", text: "学习焦虑类视频停留较久" },
    { icon: "💖", text: "MBTI 视频点赞较多" },
    { icon: "🌙", text: "深夜 emo 视频跳出率较低" },
    { icon: "🛋️", text: "搞笑摆烂类视频收藏较多" },
  ],
  recommendedQuestions: [
    "我今晚到底该努力一下，还是先放过自己？",
    "我为什么总在看很多方法，却还是不行动？",
    "今天最适合我的一个小行动是什么？",
    "我到底是真的累，还是在逃避？",
  ],
  emotionMonsters: [
    { emotion: "快乐", name: "乐啵啵", emoji: "😆", color: "#ffd98a", style: "明亮、开心、圆滚滚",
      answer: "学一点点就很棒啦！今晚完成一个小目标，你就已经赢啦！" },
    { emotion: "悲伤", name: "灰绵绵", emoji: "🥺", color: "#c9d4e8", style: "柔软、低落、像小云朵",
      answer: "如果你真的累了，休息不是偷懒，是给小心脏回血喔。" },
    { emotion: "害怕", name: "怯团团", emoji: "😨", color: "#d6c9f0", style: "小心、害怕、缩成一团",
      answer: "如果你现在状态很散，硬学可能效率不高，不如先做最简单的一题试试看。" },
    { emotion: "讨厌", name: "嫌叽叽", emoji: "😒", color: "#b8e6c8", style: "别扭、嫌弃、嘴硬",
      answer: "你不是不会学，你只是又想一口气逆天改命。先别演热血番主角了。" },
    { emotion: "愤怒", name: "炸毛毛", emoji: "😤", color: "#ffb3a8", style: "生气、炸毛、行动派",
      answer: "别磨叽！定 25 分钟，狠狠干完一小块，再决定要不要继续！" },
  ],
};

export type EmotionMonster = (typeof yaoyaoData.emotionMonsters)[number];
