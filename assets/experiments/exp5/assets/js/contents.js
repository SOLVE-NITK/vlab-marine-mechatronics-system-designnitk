"use strict";
const domain = "Mechanical Engineering";
const lab = "Thermodynamics Lab";
const exp = "Exp name here";
const domainName = document.querySelector(".domainName");
const labName = document.querySelector(".labName");
const expName = document.querySelector(".expName");

const displayTitle = function () {
  domainName.innerHTML = domain;
  labName.innerHTML = lab;
  expName.innerHTML = exp;
};
