const SUBJECT_COLOR = {
  BLP:   '#C8A96E',
  DR:    '#7BAED4',
  CON:   '#7EC47B',
  TORT:  '#7EB8A4',
  LSEW:  '#C4C26B',
  LS:    '#C46BC4',
  CAL:   '#6BB4C4',
  PC:    '#A4816B',
  PROP:  '#9B8EC4',
  WTP:   '#C47B7B',
  SA:    '#6BC49B',
  LAND:  '#88B46B',
  TRUST: '#7B8EC4',
  CRIM:  '#C46B8E',
};

export const subjectColor = (abbr) => SUBJECT_COLOR[abbr] ?? '#8A847A';
