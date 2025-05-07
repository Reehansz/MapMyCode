import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import * as d3Zoom from 'd3-zoom';

const GraphVisualizer = ({ data }) => {
  const svgRef = useRef();

  console.log("GraphVisualizer received data:", data);
  console.log("Nodes:", data.nodes);
  console.log("Links:", data.links);
  console.log("Rendering GraphVisualizer with data:", data);
  console.log("Nodes:", data.nodes);
  console.log("Links:", data.links);
  console.log("GraphVisualizer Data:", data);

  console.log("GraphVisualizer Debug:");
  console.log("SVG Ref:", svgRef.current);
  console.log("Data Nodes:", data.nodes);
  console.log("Data Links:", data.links);

  if (!data.nodes || data.nodes.length === 0) {
    console.warn("No nodes to render in the graph.");
  }
  if (!data.links || data.links.length === 0) {
    console.warn("No links to render in the graph.");
  }

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous graph

    const width = svgRef.current.clientWidth || 1200;
    const height = svgRef.current.clientHeight || 800;

    const validNodes = new Set(data.nodes.map((node) => node.id));
    const filteredLinks = data.links.filter(
      (link) => validNodes.has(link.source) && validNodes.has(link.target)
    );

    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(filteredLinks).id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    simulation.alphaDecay(0.1);

    const zoom = d3Zoom.zoom()
      .scaleExtent([0.5, 5])
      .on('zoom', (event) => {
        svg.select('g').attr('transform', event.transform);
      });

    svg.call(zoom);

    const container = svg.append('g');

    container.append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 15)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('xoverflow', 'visible')
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#999')
      .style('stroke', 'none');

    const link = container.append('g')
      .selectAll('line')
      .data(filteredLinks)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)');

    link.append('title').text(d => `Line: ${d.line}`);

    const node = container.append('g')
      .selectAll('circle')
      .data(data.nodes)
      .enter()
      .append('circle')
      .attr('r', 10)
      .attr('fill', '#69b3a2')
      .on('mouseover', (event, d) => {
        d3.select(event.target).attr('fill', '#ffcc00'); // Highlight node
        svg.append('text')
          .attr('x', event.pageX + 10)
          .attr('y', event.pageY - 10)
          .attr('class', 'tooltip')
          .text(`File: ${d.file}, Line: ${d.line}, Function: ${d.function}`);
      })
      .on('mouseout', (event, d) => {
        d3.select(event.target).attr('fill', '#69b3a2'); // Reset node color
        svg.selectAll('.tooltip').remove(); // Remove tooltip
      });

    node.call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }));

    node.append('title').text(d => d.id);

    node.on('click', (event, d) => {
      const calls = data.links.filter(link => link.source === d.id);
      const calledBy = data.links.filter(link => link.target === d.id);
      console.log('Calls:', calls);
      console.log('Called By:', calledBy);
    });

    const nodeLabels = container.append('g')
      .selectAll('text')
      .data(data.nodes)
      .enter()
      .append('text')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .attr('dy', -15)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#333')
      .text((d) => d.function);

    simulation.on('tick', () => {
      link
        .attr('x1', d => Math.max(20, Math.min(width - 20, d.source.x)))
        .attr('y1', d => Math.max(20, Math.min(height - 20, d.source.y)))
        .attr('x2', d => Math.max(20, Math.min(width - 20, d.target.x)))
        .attr('y2', d => Math.max(20, Math.min(height - 20, d.target.y)));

      node
        .attr('cx', d => Math.max(20, Math.min(width - 20, d.x)))
        .attr('cy', d => Math.max(20, Math.min(height - 20, d.y)));

      nodeLabels
        .attr('x', (d) => d.x)
        .attr('y', (d) => d.y);
    });
  }, [data]);

  return <svg ref={svgRef} width="100%" height="100%"></svg>;
};

export default GraphVisualizer;