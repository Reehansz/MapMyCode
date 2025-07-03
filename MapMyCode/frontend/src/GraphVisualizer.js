import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import * as d3Zoom from 'd3-zoom';

const colorPalette = d3.schemeCategory10;

const GraphVisualizer = ({ data, onNodeClick }) => {
  const svgRef = useRef();
  const [linkDistance, setLinkDistance] = useState(100); // Add state for link distance

  // Memoize fileColor to avoid unnecessary useEffect triggers
  const files = useMemo(() => Array.from(new Set(data.nodes.map((node) => node.file))), [data.nodes]);
  const fileColor = useMemo(() => {
    const fc = {};
    files.forEach((file, i) => {
      fc[file] = colorPalette[i % colorPalette.length];
    });
    return fc;
  }, [files]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const width = svgRef.current.clientWidth || 1200;
    const height = svgRef.current.clientHeight || 800;

    // Only function nodes, no module nodes
    const allNodes = data.nodes;
    const allLinks = data.links;

    const validNodes = new Set(allNodes.map((node) => node.id));
    const filteredLinks = allLinks.filter(
      (link) => validNodes.has(link.source) && validNodes.has(link.target)
    );

    const simulation = d3.forceSimulation(allNodes)
      .force('link', d3.forceLink(filteredLinks).id((d) => d.id).distance(linkDistance)) // Use state
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

    link.append('title').text(d => d.line ? `Line: ${d.line}` : '');

    // Add drag behavior for nodes
    const drag = d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        d3.select(event.sourceEvent.target).raise();
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = d.x;
        d.fy = d.y;
      });

    const node = container.append('g')
      .selectAll('circle')
      .data(allNodes)
      .enter()
      .append('circle')
      .attr('r', d => d.is_fixture ? 16 : 12)
      .attr('fill', d => d.is_fixture ? '#ff69b4' : (fileColor[d.file] || '#69b3a2')) // pink for fixtures
      .attr('stroke', d => d.is_fixture ? '#c2185b' : '#fff')
      .attr('stroke-width', d => d.is_fixture ? 3 : 1)
      .call(drag)
      .on('mouseover', (event, d) => {
        d3.select(event.target).attr('fill', d.is_fixture ? '#ffb6d5' : '#ffcc00');
        svg.append('text')
          .attr('x', event.pageX + 10)
          .attr('y', event.pageY - 10)
          .attr('class', 'tooltip')
          .text(d.is_fixture
            ? `Fixture: ${d.function} (File: ${d.file}, Line: ${d.line})`
            : `File: ${d.file}, Line: ${d.line}, Function: ${d.function}`);
      })
      .on('mouseout', (event, d) => {
        d3.select(event.target).attr('fill', d.is_fixture ? '#ff69b4' : (fileColor[d.file] || '#69b3a2'));
        svg.selectAll('.tooltip').remove();
      });

    node.append('title').text(d => d.id);

    const nodeLabels = container.append('g')
      .selectAll('text')
      .data(allNodes)
      .enter()
      .append('text')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .attr('dy', -18)
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.is_fixture ? '16px' : '14px')
      .attr('font-weight', 'bold')
      .attr('fill', d => d.is_fixture ? '#c2185b' : '#333')
      .text((d) => d.is_fixture ? `${d.function} [fixture]` : d.function)
      .style('pointer-events', 'none');

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
        .attr('y', (d) => d.y - 18);
    });

    // Reheat simulation when linkDistance changes
    simulation.alpha(0.5).restart();
    return () => simulation.stop();
  }, [data, fileColor, linkDistance]);

  // Render legend as a React element absolutely positioned over the SVG
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Link distance slider */}
      <div style={{ position: 'absolute', top: 8, right: 24, zIndex: 30, background: 'rgba(255,255,255,0.95)', border: '1px solid #ccc', borderRadius: 6, padding: '8px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <label style={{ fontSize: 13, fontWeight: 'bold', marginRight: 8 }}>
          Node Spacing:
        </label>
        <input
          type="range"
          min={50}
          max={400}
          value={linkDistance}
          onChange={e => setLinkDistance(Number(e.target.value))}
          style={{ verticalAlign: 'middle' }}
        />
        <span style={{ marginLeft: 8, fontSize: 13 }}>{linkDistance}px</span>
      </div>
      <svg ref={svgRef} width="100%" height="100%"></svg>
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 16,
          background: 'rgba(255,255,255,0.95)',
          border: '1px solid #ccc',
          borderRadius: 6,
          padding: '8px 16px',
          zIndex: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          maxHeight: 300,
          overflowY: 'auto',
          minWidth: 120,
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: 6 }}>File Color Legend</div>
        {files.map((file, i) => (
          <div key={file} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <span style={{
              display: 'inline-block',
              width: 18,
              height: 18,
              background: fileColor[file],
              border: '1px solid #888',
              borderRadius: 3,
              marginRight: 8,
            }} />
            <span style={{ fontSize: 13, color: '#222', wordBreak: 'break-all' }}>{file}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GraphVisualizer;
