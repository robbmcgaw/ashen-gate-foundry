// Appearance cards (and the Size switch) as a radio group: click or arrow keys choose, Space/Enter activate (cards are buttons).
const NEXT=['ArrowRight','ArrowDown'],PREV=['ArrowLeft','ArrowUp'];

export function nextRadioIndex(key,index,count){
  if(!count)return null;
  if(NEXT.includes(key))return (index+1)%count;
  if(PREV.includes(key))return (index-1+count)%count;
  if(key==='Home')return 0;
  if(key==='End')return count-1;
  return null;
}

// valueKey: the dataset key holding each radio's value (skin cards: agSkinValue; Size switch: agSizeValue).
export function bindSkinPicker(group,onChange,{valueKey='agSkinValue'}={}){
  if(!group)return;
  const radios=()=>[...group.querySelectorAll('[role="radio"]')];
  const select=(radio,focus)=>{
    for(const r of radios()){
      const on=r===radio;
      r.setAttribute('aria-checked',on?'true':'false');
      r.setAttribute('tabindex',on?'0':'-1');
      r.classList?.toggle('is-selected',on);
    }
    if(focus)radio.focus?.();
    onChange(radio.dataset[valueKey]??'');
  };
  group.addEventListener('click',event=>{
    const radio=event.target?.closest?.('[role="radio"]');
    if(radio&&group.contains?.(radio)!==false){event.preventDefault?.();select(radio,false);}
  });
  group.addEventListener('keydown',event=>{
    const list=radios(),current=list.indexOf(event.target?.closest?.('[role="radio"]'));
    if(current<0)return;
    const next=nextRadioIndex(event.key,current,list.length);
    if(next===null)return;
    event.preventDefault?.();select(list[next],true);
  });
}
