const margin = { top: 40, right: 40, bottom: 40, left: 60 };
const width  = 975 * 1.1;
const height = 610 * 1.1;

const projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
const path       = d3.geoPath().projection(projection);

// Holds the four small‐map SVG selections
const smallSvgs = [];

// Shared zoom for the small maps
const sharedZoom = d3.zoom()
.scaleExtent([1, 8])
.filter(e => e.shiftKey)
.on("zoom", ({ transform }) => {
  smallSvgs.forEach(svg => {
    svg.node().__zoom = transform;
    svg.select("g").attr("transform", transform);
  });
});

// “Home” (identity) transform for resets
const sharedHome = d3.zoomIdentity
  .translate(margin.left, margin.top)
  .scale(1);

function stateIdToAbbr(id) {
  const map = {
    1:'AL',2:'AK',4:'AZ',5:'AR',6:'CA',8:'CO',9:'CT',10:'DE',
    11:'DC',12:'FL',13:'GA',15:'HI',16:'ID',17:'IL',18:'IN',
    19:'IA',20:'KS',21:'KY',22:'LA',23:'ME',24:'MD',25:'MA',
    26:'MI',27:'MN',28:'MS',29:'MO',30:'MT',31:'NE',32:'NV',
    33:'NH',34:'NJ',35:'NM',36:'NY',37:'NC',38:'ND',39:'OH',
    40:'OK',41:'OR',42:'PA',44:'RI',45:'SC',46:'SD',47:'TN',
    48:'TX',49:'UT',50:'VT',51:'VA',53:'WA',54:'WV',55:'WI',
    56:'WY'
  };
  return map[id] || null;
}

function formatValue(val, decimals = 2) {
  return Number.isFinite(val) ? val.toFixed(decimals) : "N/A";
}

function tooltipLine(label, val, decimals = 2) {
  return `<strong>${label}:</strong> ${formatValue(val, decimals)}<br/>`;
}

function createVis(data, us, variable, title, containerSelector, isSmall) {
  const container = d3.select(containerSelector);
  const wrapper   = container.append('div')
    .style('width',  '100%')
    .style('height', '100%')
    .style('position','relative');

  const svg = wrapper.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`);

  // 1) Append the <g>
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // 2) Choose & attach the correct zoom behavior
  let zoomBehavior;
  if (isSmall) {
    smallSvgs.push(svg);
    zoomBehavior = sharedZoom;
  } else {
    zoomBehavior = d3.zoom()
      .scaleExtent([1, 8])
      .filter(e => e.shiftKey)
      .on("zoom", ({ transform }) => {
        // keep big map’s state intact automatically
        g.attr("transform", transform);
      });
  }

  svg.call(zoomBehavior)
      .call(zoomBehavior.transform, sharedHome)
      .on("dblclick.zoom", null)
      .on("dblclick", () =>
        svg.transition().duration(750)
          .call(zoomBehavior.transform, sharedHome)
      );

  // 3) Bind data & color scale
  const counties = topojson.feature(us, us.objects.counties).features;
  counties.forEach(c => {
    const idStr = String(+c.id);
    if (data[idStr]) c.properties = { ...c.properties, ...data[idStr] };
    else            c.properties.missing = true;
  });

  const extent = d3.extent(counties, d =>
    d.properties[variable] != null ? d.properties[variable] : null
  );
  const palette = {
    walkability_index:    d3.interpolateYlGnBu,
    intersection_density: d3.interpolatePurples,
    proximity_to_transit: d3.interpolateOranges,
    employment_mix:       d3.interpolateBlues,
    household_mix:        d3.interpolateGreens
  };
  const colorScale = d3.scaleSequential()
    .domain(extent)
    .interpolator(palette[variable]);

  // 4) Draw counties
  g.selectAll("path.county")
    .data(counties)
    .enter().append("path")
      .attr("class", "county")
      .attr("d", path)
      .attr("fill", d =>
        Number.isFinite(d.properties[variable])
          ? colorScale(d.properties[variable])
          : "#ccc"
      )
      .attr("stroke", "white")
      .attr("stroke-width", 0.5)
      .on("mouseover", function(event, d) {
        d3.select(this).attr("stroke", "black");
        let html;
        if (variable === "walkability_index") {
          html = `
            <strong style="font-size:15px;">
              ${d.properties.county_name || "Unknown"} County
            </strong><br/>
            ${tooltipLine("Walkability Index",        d.properties.walkability_index,    2)}
            ${tooltipLine("Intersection Density",     d.properties.intersection_density,  2)}
            ${tooltipLine("Transit Proximity",        d.properties.proximity_to_transit,  2)}
            ${tooltipLine("Employment Mix",           d.properties.employment_mix,        3)}
            ${tooltipLine("Household & Employment Mix", d.properties.household_mix,       3)}
          `;
        } else {
          html = `
            <strong style="font-size:15px;">
              ${d.properties.county_name || "Unknown"} County
            </strong><br/>
            <strong>${title}:</strong> ${formatValue(d.properties[variable], 3)}<br/>
          `;
        }
        d3.select("#tooltip")
          .style("display", "block")
          .html(html)
          .style("left", (event.pageX + 20) + "px")
          .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", function() {
        d3.select(this).attr("stroke", "white");
        d3.select("#tooltip").style("display", "none");
      });

  // 5) Chart title
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .style("font", "bold 20px sans-serif")
    .text(title);

  // 6) State borders
  g.append("path")
    .datum(topojson.mesh(us, us.objects.states, (a,b) => a !== b))
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", "white")
    .attr("stroke-width", 2);

  // 7) State labels
  const states = topojson.feature(us, us.objects.states).features;
  states.forEach(s => s.properties.state_name = stateIdToAbbr(s.id));
  g.selectAll("text.state-label")
    .data(states)
    .enter().append("text")
      .attr("class", "state-label")
      .style("pointer-events", "none")
      .attr("x", d => path.centroid(d)[0])
      .attr("y", d => path.centroid(d)[1])
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .text(d => d.properties.state_name);

  // 8) Legend
  const legendNode = Legend(
    d3.scaleSequential(extent, palette[variable]),
    { title }
  );
  d3.select(containerSelector + "_legend").node().append(legendNode);

  // 9) Click-to-focus: zoom on click
  g.selectAll("path.county").on("click", (event, d) => {
    event.stopPropagation();
    const stateFip     = Math.floor(+d.id / 1000);
    const stateFeature = states.find(s => +s.id === stateFip);
    if (!stateFeature) return;

    const [[x0,y0],[x1,y1]] = path.bounds(stateFeature);
    const pad   = 100;
    const scale = Math.min(
      (width  - 2*pad) / (x1 - x0),
      (height - 2*pad) / (y1 - y0)
    );
    const translate = [
      width  / 2 - scale * (x0 + x1) / 2,
      height / 2 - scale * (y0 + y1) / 2
    ];
    const t = d3.zoomIdentity
      .translate(margin.left + translate[0],
                  margin.top  + translate[1])
      .scale(scale);

    if (isSmall) {
      smallSvgs.forEach(s =>
        s.transition().duration(750)
          .call(sharedZoom.transform, t)
      );
    } else {
      // For big map, re-use the zoomBehavior
      svg.transition().duration(750)
          .call(zoomBehavior.transform, t);
    }
  });
}

async function init() {
  const walkData = await d3.csv("./data/walkability_by_county.csv", d => ({
    state_id: +d.state_fp,
    county_fip: +d.county_fp,
    walkability_index: +d.avg_walkability_index,
    intersection_density: +d.avg_intersection_density,
    proximity_to_transit: +d.avg_proximity_to_transit,
    employment_mix: +d.avg_employment_mix,
    household_mix: +d.avg_employment_household_mix
  }));

  const fips = await d3.csv("./data/fips_codes.csv", d => ({
    state_name: d.state,
    county_name: d.county,
    state_fip: d.state_fp,
    county_fip: d.county_fp
  }));

  const us = await d3.json("./data/us.json");

  // Merge data by FIPS
  const data = {};
  walkData.forEach(v => {
    fips.forEach(f => {
      if (v.county_fip === +f.county_fip && v.state_id === +f.state_fip) {
        const id = v.state_id.toString().padStart(2,"0")
                  + v.county_fip.toString().padStart(3,"0");
        data[id] = {
          state_name: f.state_name,
          county_name: f.county_name,
          walkability_index:    v.walkability_index,
          intersection_density: v.intersection_density,
          proximity_to_transit: v.proximity_to_transit,
          employment_mix:       v.employment_mix,
          household_mix:        v.household_mix
        };
      }
    });
  });

  // Render the four small maps (sharedZoom)
  createVis(data, us, "intersection_density", "Intersection Density",   "#density",   true);
  createVis(data, us, "proximity_to_transit", "Proximity to Transit", "#proximity", true);
  createVis(data, us, "employment_mix",       "Employment Mix",       "#employment",true);
  createVis(data, us, "household_mix",        "Household Mix",        "#household", true);

  // Render the big map (independent zoom)
  createVis(data, us, "walkability_index", "Walkability Index", "#walkability", false);
}

window.addEventListener('load', init);

function Legend(color, {
title,
tickSize = 6,
width = 320,
height = 44 + tickSize,
marginTop = 18,
marginRight = 0,
marginBottom = 16 + tickSize,
marginLeft = 0,
ticks = width / 64,
tickFormat,
tickValues
} = {}) {
  function ramp(color, n = 256) {
    const canvas = document.createElement("canvas");
    canvas.width = n; canvas.height = 1;
    const ctx = canvas.getContext("2d");
    for (let i = 0; i < n; ++i) {
      ctx.fillStyle = color(i / (n - 1));
      ctx.fillRect(i, 0, 1, 1);
    }
    return canvas;
  }

  const svg = d3.create("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .style("overflow", "visible")
      .style("display", "block");

  let x, tickAdjust = g => g.selectAll(".tick line")
                              .attr("y1", marginTop + marginBottom - height);

  if (color.interpolate) {
    const n = Math.min(color.domain().length, color.range().length);
    x = color.copy().rangeRound(
      d3.quantize(d3.interpolate(marginLeft, width - marginRight), n)
    );
    svg.append("image")
      .attr("x", marginLeft).attr("y", marginTop)
      .attr("width", width - marginLeft - marginRight)
      .attr("height", height - marginTop - marginBottom)
      .attr("preserveAspectRatio", "none")
      .attr("xlink:href", ramp(color.copy().domain(
        d3.quantize(d3.interpolate(0, 1), n)
      )).toDataURL());
  } else if (color.interpolator) {
    x = Object.assign(
      color.copy().interpolator(d3.interpolateRound(marginLeft, width - marginRight)),
      { range() { return [marginLeft, width - marginRight]; } }
    );
    svg.append("image")
      .attr("x", marginLeft).attr("y", marginTop)
      .attr("width", width - marginLeft - marginRight)
      .attr("height", height - marginTop - marginBottom)
      .attr("preserveAspectRatio", "none")
      .attr("xlink:href", ramp(color.interpolator()).toDataURL());
    if (!x.ticks) {
      if (tickValues === undefined) {
        const n = Math.round(ticks + 1);
        tickValues = d3.range(n).map(i => d3.quantile(color.domain(), i / (n - 1)));
      }
      if (typeof tickFormat !== "function") {
        tickFormat = d3.format(tickFormat === undefined ? ",f" : tickFormat);
      }
    }
  }

  svg.append("g")
    .attr("transform", `translate(0,${height - marginBottom})`)
    .call(d3.axisBottom(x)
      .ticks(ticks, typeof tickFormat === "string" ? tickFormat : undefined)
      .tickFormat(typeof tickFormat === "function" ? tickFormat : undefined)
      .tickSize(tickSize)
      .tickValues(tickValues))
    .call(tickAdjust)
    .call(g => g.select(".domain").remove())
    .call(g => g.append("text")
      .attr("x", marginLeft)
      .attr("y", marginTop + marginBottom - height - 6)
      .attr("fill", "currentColor")
      .attr("text-anchor", "start")
      .attr("font-weight", "bold")
      .attr("class", "title")
      .text(title)
    );

  return svg.node();
}