const exps = [
  {
    id:1,
    name:'Experiment 1',
    path: "./Experiment1/index.html"
  },
  {
    id:2,
    name:'Experiment 1.1',
    path: "./Experiment1.1/index.html"
  },
  {
    id:3,
    name:'Experiment 2',
    path: "./Experiment2/index.html"
  },
  {
    id:4,
    name:'Experiment 3',
    path: "./Experiment3/exp3.html"
  }
]

const expList=document.querySelector(".experiment-list");
exps.map(exp=>{
  const experiment=document.createElement('a');
  experiment.innerHTML=exp.name;
  experiment.href=exp.path;
  experiment.target = "_blank";
  experiment.classList.add('experiment-card');
  expList.appendChild(experiment)
})