"use strict";

let html;

// Insert contents to page
const insertContent = function (sectionDiv, element) {
  sectionDiv.insertAdjacentHTML("beforeend", element);
};

// create paragraph and single list elements
const createContent = function (sectionDiv, tagName, elementValue) {
  html = `<${tagName}>${elementValue}</${tagName}>`;
  insertContent(sectionDiv, html);
};

// Create list with hyperlink
const createExpList = function (sectionDiv, expName, expLink) {
  html = `<li><a class=${expName} href=${expLink}>${expName}</a></li>`;
  insertContent(sectionDiv, html);
};

// Create list within a list
// const createMultipleList = function (mainCoarse, subCoarse) {
//   html = `<li>${mainCoarse}<ul><li>${subCoarse}</li></ul></li>`;
//   insertContent(html);
// };
const createMultipleList = function (sectionDiv, mainCoarse, subCoarse) {
  html = `<li>${mainCoarse}<ul>`;
  //Multiple list for single mainCoarse
  subCoarse.forEach((coarse) => {
    html += `<li>${coarse}</li>`;
  });
  html += `</ul></li>`;
  insertContent(sectionDiv, html);
};

//Create diffrent contents
const createContents = function (sectionDiv, data, sectionName, tag) {
  const section = data[sectionName];
  // For experiment list
  if (tag === "li+a") {
    for (let exp in section) {
      createExpList(sectionDiv, exp, section[exp]);
    }
    return;
  }
  // For target audience
  if (tag === "li+li") {
    for (let coarse in section) {
      createMultipleList(sectionDiv, coarse, section[coarse]);
    }
    return;
  }
  // For introduction, objectives, coarse alignment
  section.forEach((elValue) => {
    createContent(sectionDiv, tag, elValue);
  });
};

// Fetch different contents from contents.json file
const displayContent = function (sectionName, tag) {
  const sectionDiv = document.querySelector(`.${sectionName}`);
  fetch("assets/json/contents.json")
    .then((res) => res.json())
    .then((data) => {
      if (tag === "name") {
        insertContent(sectionDiv, data[sectionName]);
        return;
      }
      createContents(sectionDiv, data, sectionName, tag);
    });
};

const displayDomainName = function (sectionName, tag) {
  displayContent(sectionName, tag);
};

const displayLabName = function (sectionName, tag) {
  displayContent(sectionName, tag);
};

const displayLabTitle = function (sectionName, tag) {
  displayContent(sectionName, tag);
};
