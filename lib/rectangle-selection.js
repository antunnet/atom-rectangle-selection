var CompositeDisposable;
var Range;

module.exports={
	rectangleSelection: {},
	commanding: false,
	
	commandSubscription: null,
	
	textEditorObservation: null,
	patchedTextEditors: [],
	
	undoSubscription: null,
	
	activate: function(state) {
		var atomClasses=require("atom");
		CompositeDisposable=atomClasses.CompositeDisposable;
		Range=atomClasses.Range;
		
		this.commandSubscription=new CompositeDisposable();
		this.commandSubscription.add(atom.commands.add(
		    "atom-text-editor","rectangle-selection:select-up",(event) => {
			this.commandSelection(() => {
				this.selectUpByPixelPosition(event);
			});
		}));
		this.commandSubscription.add(atom.commands.add(
		    "atom-text-editor","rectangle-selection:select-down",(event) => {
			this.commandSelection(() => {
				this.selectDownByPixelPosition(event);
			});
		}));
		this.commandSubscription.add(atom.commands.add(
		    "atom-text-editor","rectangle-selection:select-left",(event) => {
			this.commandSelection(() => {
				atom.workspace.getActiveTextEditor().selectLeft(1);
			});
		}));
		this.commandSubscription.add(atom.commands.add(
		    "atom-text-editor","rectangle-selection:select-right",(event) => {
			this.commandSelection(() => {
				atom.workspace.getActiveTextEditor().selectRight(1);
			});
		}));
		this.commandSubscription.add(atom.commands.add(
		    "atom-text-editor","rectangle-selection:cancel",(event) => {
			this.cancelSelection(atom.workspace.getActiveTextEditor(),true);
			
			event.abortKeyBinding();
		}));
		
		this.undoSubscription=new CompositeDisposable();
		this.textEditorObservation=
		    atom.workspace.observeTextEditors((textEditor) => {
			textEditor.onWillUndo=function(callback) {
				return this.emitter.on("will-undo",callback);
			};
			textEditor.onDidUndo=function(callback) {
				return this.emitter.on("did-undo",callback);
			};
			textEditor.undo=function() {
				this.emitter.emit("will-undo");
				
				this.__proto__.undo.call(this);
				
				this.emitter.emit("did-undo");
			};
			this.patchedTextEditors.push(textEditor);
			
			this.undoSubscription.add(textEditor.onWillUndo(() => {
				this.cancelSelection(atom.workspace.getActiveTextEditor(),true);
			}));
			this.undoSubscription.add(textEditor.onDidUndo(() => {
				if (!this.isSelecting(textEditor) &&
				    textEditor.getSelections().some((selection) =>
				    selection.marker.getProperties().rectangleSelection))
				{
//					atom.notifications.addInfo("Rectangle undo");
					
					this.commandSelection(() => {});
				}
			}));
		}) 
	},
	
	deactivate: function() {
		this.commandSubscription.dispose();
		this.commandSubscription=null;
		
		this.undoSubscription.dispose();
		this.undoSubscription=null;
		this.textEditorObservation.dispose();
		this.textEditorObservation=null;
		
		for (var textEditor of this.patchedTextEditors)
		{
			delete textEditor.onDidUndo;
			delete textEditor.undo;
		}
		this.patchedTextEditors=[];
		
		for (var textEditorId in this.rectangleSelection)
		{
			this.cancelSelection(
			    this.rectangleSelection[textEditorId].textEditor,true);
		}
		this.rectangleSelection=[];
		
		CompositeDisposable=null;
		Range              =null;
	},
	
	selectUpByPixelPosition: function() {
		var textEditor=atom.workspace.getActiveTextEditor();
		var textEditorElement=atom.views.getView(textEditor);
		var pixelPosition=
			textEditorElement.pixelPositionForScreenPosition(
			textEditor.getCursorScreenPosition());
		pixelPosition.top=pixelPosition.top-
			textEditor.getLineHeightInPixels();
		textEditor.selectToScreenPosition(
			textEditorElement.screenPositionForPixelPosition(
			pixelPosition));
	},
	
	selectDownByPixelPosition: function() {
		var textEditor=atom.workspace.getActiveTextEditor();
		var textEditorElement=atom.views.getView(textEditor);
		var pixelPosition=
			textEditorElement.pixelPositionForScreenPosition(
			textEditor.getCursorScreenPosition());
		pixelPosition.top=pixelPosition.top+
			textEditor.getLineHeightInPixels();
		textEditor.selectToScreenPosition(
			textEditorElement.screenPositionForPixelPosition(
			pixelPosition));
	},
	
	commandSelection: function(callback) {
		var textEditor=atom.workspace.getActiveTextEditor();
		
		this.commanding=true;
		if (!this.isSelecting(textEditor))
		{
			this.startSelection(textEditor);
		}
		
		callback();
		
		this.adjustSelection(textEditor);
		this.commanding=false;
	},
	
	startSelection: function(textEditor) {
		var textEditorElement=atom.views.getView(textEditor);
		
		this.rectangleSelection[textEditor.id]={};
		this.rectangleSelection[textEditor.id].textEditor=textEditor;
		this.rectangleSelection[textEditor.id].screenPositionCache={};
		
		var oldSelections=textEditor.getSelections();
		if (oldSelections.every((selection) => selection.isEmpty()))
		{
			this.rectangleSelection[textEditor.id].origin=
			    textEditor.getCursorScreenPosition();
		}
		else
		{
			this.rectangleSelection[textEditor.id].origin=
			    (oldSelections[oldSelections.length-1].getScreenRange().
			     start.isEqual(textEditor.getCursorScreenPosition()) ?
			     oldSelections[0].getScreenRange().end :
			     oldSelections[0].getScreenRange().start);
		}
		
		var completion={};
		this.rectangleSelection[textEditor.id].subscription=
		    new CompositeDisposable();
		this.rectangleSelection[textEditor.id].subscription.add(
		    textEditor.onDidChangeSelectionRange((event) => {
			// マルチカーソル時
			//   範囲選択してインサートは表示上の上から順に呼ばれる
			//   カーソル動かす時は登録順に呼ばれる
			var selections=textEditor.getSelections();
			if (selections.length!=Object.keys(completion).length ||
			    selections.some((selection1) =>
			    completion[selection1.id]==null))
			{
				completion={};
				for (var selection1 of selections)
				{
					completion[selection1.id]=0;
				}
			}
			if (event.oldScreenRange.isSingleLine() &&
			    event.newScreenRange.isSingleLine() &&
			    event.oldScreenRange.end.column-
			    event.oldScreenRange.start.column>0 &&
			    event.newScreenRange.end.column==
			    event.newScreenRange.start.column)
			{
				for (var selection1 of selections)
				{
					if (selection1.id!=event.selection.id &&
					    selection1.getBufferRange().isSingleLine() &&
					    event.selection.getBufferRange().coversSameRows(
					    selection1.getBufferRange()) &&
					    event.selection.getBufferRange().start.column<
					    selection1.getBufferRange().start.column)
					{
						completion[selection1.id]=completion[selection1.id]-1;
					}
				}
			}
			completion[event.selection.id]=
			    completion[event.selection.id]+1;
			var lastSelection=
			    Object.keys(completion).every((key) => completion[key]>0);
			if (lastSelection)
			{
				completion={};
			}
/*
			if (!this.commanding)
			{
				console.log(selections.map((selection1) =>
				    (selection1==event.selection ?
				     event.oldScreenRange+"->" : "")+
				     selection1.getScreenRange()).join(", "));
			}
*/
			if (!this.commanding && (lastSelection ||
			    selections.every((selection1) => selection1.isEmpty())))
			{
//				console.log("cancel timing");
				
				this.cancelSelection(textEditor);
				
				completion={};
			}
		}));
		this.rectangleSelection[textEditor.id].subscription.add(
		    textEditor.observeSelections((selection) => {
			if (!this.commanding)
			{
				this.cancelSelection(textEditor);
				
				completion={};
			}
			else
			{
/*
				this.rectangleSelection[textEditor.id].subscription.add(
				    selection.onDidChangeRange((event) => {
					// 引数来ない不具合があるので、修正されるまで
					// onDidChangeSelectionRange で処理する
				}));
*/
				this.rectangleSelection[textEditor.id].subscription.add(
				    selection.onDidDestroy(() => {
					if (!this.commanding)
					{
						this.cancelSelection(textEditor);
						
						completion={};
					}
				}));
			}
		}));
		this.rectangleSelection[textEditor.id].subscription.add(
		    textEditor.onDidDestroy(() => {
			this.cancelSelection(textEditor,true);
		}));
		
//		atom.notifications.addInfo("Rectangle start");
	},
	
	isSelecting: function(textEditor) {
		return (this.rectangleSelection[textEditor.id]!=null);
	},
	
	adjustSelection: function(textEditor) {
		var textEditorElement=atom.views.getView(textEditor);
		
		var ranges=[];
		var lineHeight=textEditor.getLineHeightInPixels();
		var corner=
		    textEditorElement.pixelPositionForScreenPosition(
		    textEditor.getCursorScreenPosition());
		var origin=
		    textEditorElement.pixelPositionForScreenPosition(
		    this.rectangleSelection[textEditor.id].origin);
		var dy=corner.top-origin.top;
		if (dy!=0)
		{
			dy=dy/Math.abs(dy)*lineHeight;
		}
		var y=origin.top;
		var screenPositionCache=
		    this.rectangleSelection[textEditor.id].screenPositionCache;
		while (true)
		{
			var p0={ left: origin.left, top: y };
			var p1={ left: corner.left, top: y };
			var cacheKey=p0.left+","+p0.top;
			if (screenPositionCache[cacheKey]==null)
			{
				screenPositionCache[cacheKey]=
				    textEditorElement.screenPositionForPixelPosition(p0);
			}
			p0=screenPositionCache[cacheKey];
			var cacheKey=p1.left+","+p1.top;
			if (screenPositionCache[cacheKey]==null)
			{
				screenPositionCache[cacheKey]=
				    textEditorElement.screenPositionForPixelPosition(p1);
			}
			p1=screenPositionCache[cacheKey];
			ranges.push(new Range(p0,p1));
			
			if (y!=corner.top)
			{
				y=y+dy;
			}
			else
			{
				break;
			}
		}
		textEditor.setSelectedScreenRanges(ranges,
		    { reversed: corner.left<origin.left });
		
		for (var selection of textEditor.getSelections())
		{
			selection.marker.setProperties({ rectangleSelection: true });
		}
	},
	
	cancelSelection: function(textEditor,forceEmpty) {
		if (!this.isSelecting(textEditor))
		{
			return;
		}
		
		this.rectangleSelection[textEditor.id].subscription.dispose();
		
		if (textEditor.isDestroyed())
		{
			// nop
		}
		else
		{
			for (var selection of textEditor.getSelections())
			{
				selection.marker.setProperties({ rectangleSelection: false });
			}
			
			if (textEditor.getSelections().every(
			    (selection) => selection.isEmpty()) || forceEmpty)
			{
				textEditor.setCursorScreenPosition(
				    textEditor.getCursorScreenPosition());
			}
			else
			{
				var origin=this.rectangleSelection[textEditor.id].origin;
				if (textEditor.getSelections().some((selection) =>
				    selection.getScreenRange().start.isEqual(origin) ||
				    selection.getScreenRange().end.isEqual(origin)))
				{
					var corner=textEditor.getCursorScreenPosition();
					textEditor.setSelectedScreenRange(
					    new Range(origin,corner),
					    { reversed: corner.column<origin.column ||
					                corner.row<origin.row });
				}
			}
		}
		
		delete this.rectangleSelection[textEditor.id];
		
//		atom.notifications.addInfo("Rectangle bye");
	},
};
