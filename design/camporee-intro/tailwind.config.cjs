// Compile the original Polymet classes to static CSS, as with the camporee card.
module.exports={
  content:['./app/components/event-intro/**/*.tsx'],
  important:'.camp-intro-root',
  corePlugins:{preflight:false},
  theme:{extend:{fontFamily:{sans:['Poppins','ui-sans-serif','system-ui','sans-serif']}}},
  plugins:[],
};
