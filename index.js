#!/usr/bin/env node

const fs = require('fs')
const _ = require('lodash')
const jsonxml = require('jsontoxml')
const format = require('xml-formatter')
const marked = require('marked')
const he = require('he')
const Viz = require('viz.js')
const { Module, render } = require('viz.js/full.render.js')
const fetch = require('node-fetch')

let viz = new Viz({ Module, render })

//mindmap
const ConvertViz = async (input) => {
  if (/```graphviz/.exec(input)) {
    let vizString = input.replace('graphviz', '').split('```')[1]
    let result = await viz.renderString(vizString)
    let count = 0
    let graphviz = ''
    result.split('\n').map((line) => {
      if (count > 5) {
        if (/width/.test(line)) {
          line = line.replace(line.match(/width\=(.*?) /)[1], '"100%"')
        }
        graphviz += line
      }
      count++
    })
    return graphviz
  } else {
    return ''
  }
}

//markdown to akomaNtoso
const md2an = (input, graphviz) => {
  let references = []
  let debateSection = []
  let speakers = []
  let count = 0
  let sections = input.replace(/\n:::info\n[\d\D]*?\n:::\n/, '').split('###')
  debateSection.push({ heading: (input.match(/^#* (.*)/) || [])[1] })
  if (graphviz != '') {
    let narrative = {
      name: 'narrative',
      children: [
        {
          p: graphviz
        }
      ]
    }
    debateSection.push(narrative)
  }
  sections.map((section) => {
    // first section = ''
    if (!/\S/.test(section)) {
      return
    }
    // info section
    if (count == 0) {
      count++
      let lines = section.split(/\n+/)
      lines.map((line) => {
        //iframe
        if (/(?=.*>)(?=.*iframe).*/.exec(line)) {
          let hyperlink = line.match(/\<iframe(.*?)<\/iframe>/)[0]
          let narrative = {
            name: 'narrative',
            children: [
              {
                p: {
                  i: `${hyperlink}`
                }
              }
            ]
          }
          debateSection.push(narrative)
          return
        }
        //image
        if (/(?=.*>)(?=.*img).*/.exec(line)) {
          let hyperlink = line.match(/\<img(.*?)\/>/)[0]
          let narrative = {
            name: 'narrative',
            children: [
              {
                p: {
                  i: `${hyperlink}`
                }
              }
            ]
          }
          debateSection.push(narrative)
          return
        }
        //handle multiple hyperlinks
        if (/(?=.*>)(?=.*\[)(?=.*（).*/.exec(line)) {
          let narrative = {
            name: 'narrative',
            children: [
              {
                p: {
                  i: HandleTags(line.replace('> ', ''))
                }
              }
            ]
          }
          debateSection.push(narrative)
          return
        }
      })
      return
    }
    let speaker = (section.match(/ (.*?)[:：]/) || [])[1]
    // speaker sections
    if (speaker) {
      let context = section.replace(/ (.*?)[:：]/, '')
      context.split(/[\r\n]{2,}/).map((p) => {
        if (!/\S/.test(p)) {
          return
        }
        if (/^>/.exec(p)) {
          let narrative = {
            name: 'narrative',
            children: [
              {
                p: {
                  i: HandleTags(p.replace('> ', ''))
                }
              }
            ]
          }
          debateSection.push(narrative)
          return
        }
        let speech = {
          name: 'speech',
          attrs: {
            by: '#' + speaker
          },
          children: [
            {
              p: HandleTags(p)
            }
          ]
        }
        if (/<a href="/.test(speech.children[0].p)) {
          let linkbefore = speech.children[0].p.match(/<a href(.*?)>/)[0]
          let linkafter = linkbefore
          speech.children[0].p = speech.children[0].p.replace(
            linkbefore,
            linkafter
          )
        }
        debateSection.push(JSON.parse(JSON.stringify(speech)))
      })
      speakers.push(speaker)
    }
  })
  speakers = _.uniq(speakers)
  speakers.map((speaker) => {
    let TLCPerson = {
      name: 'TLCPerson',
      attrs: {
        href: '/ontology/person/::/' + speaker,
        id: speaker,
        showAs: speaker
      }
    }
    references.push(TLCPerson)
  })
  if (/Office Hour_/.test(debateSection[0].heading)) {
    let heading = debateSection[0].heading.replace(/_[^_]*$/, '')
    debateSection[0].heading = debateSection[0].heading.replace(
      /.*Office Hour_/,
      ''
    )
    debateSection = [{ heading: heading }, { debateSection: debateSection }]
  }
  let xml = jsonxml(
    {
      akomaNtoso: {
        debate: {
          meta: {
            references
          },
          debateBody: {
            debateSection: debateSection
          }
        }
      }
    },
    { xmlHeader: true, escape: true }
  )
  let output = format(xml)
  output = output
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
  return output
}

const HandleTags = (p) => {
  return he
    .decode(marked(p.replace(/^[\r\n]+/, ''), { smartypants: true }))
    .replace(/^\s*<p>\s*|\s*<\/p>\s*$/g, '')
    .replace(/<strong>/g, '<b>')
    .replace(/<\/strong>/g, '</b>')
    .replace(/<em>/g, '<i>')
    .replace(/<\/em>/g, '</i>')
    .replace(/&/g, '&#x26;')
}

const CheckEncodeURI = (url) => {
  return /\%/i.test(url)
}

const GetOutput = async (md) => {
  const graphviz = await ConvertViz(md)
  const xml = md2an(md, graphviz)
  console.log(xml)
  return xml
}

const init = async () => {
  let md = ''
  const source = process.argv[2]

  if (source.startsWith('https://')) {
    const url = CheckEncodeURI(source) ? source : encodeURI(source)
    const res = await fetch(url)
    md = await res.text()
  } else {
    md = fs.readFileSync(source, 'utf-8')
  }

  return await GetOutput(md)
}

init()
